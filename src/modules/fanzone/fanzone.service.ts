import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { FanzoneEntity, GeoJsonPoint } from './entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { CheckinEntity } from '../checkin/entities/checkin.entity';
import { CreateFanzoneDto } from './dto/create-fanzone.dto';
import { UpdateFanzoneDto } from './dto/update-fanzone.dto';
import { FanzoneFilterDto } from './dto/fanzone-filter.dto';
import { CrowdStatusDto, TeamCrowdDto } from './dto/fanzone-list-response.dto';

/**
 * How far back a check-in still counts as "currently present".
 *
 * CheckinEntity records only a `createdAt` — there is no check-out or expiry
 * column — so presence has to be bounded by a rolling window. Four hours covers
 * a match plus the build-up and wind-down around it, after which a check-in is
 * treated as stale rather than accumulating forever.
 *
 * Exported because CheckinService applies the same window when rejecting a
 * repeat check-in: if the writer's idea of "still present" were shorter than the
 * reader's, one user could contribute several rows to a single crowd count.
 */
export const CROWD_PRESENCE_WINDOW_HOURS = 4;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const METRES_PER_KILOMETRE = 1000;

/** WGS 84 — the SRID of `FanzoneEntity.location`. */
const SRID = 4326;

/**
 * A fan zone carrying the distance computed for a location-filtered search.
 *
 * `distance` is not a column; `findAll` attaches it when the caller supplied
 * coordinates, and the controller lifts it into `FanzoneListResponseDto.distance`.
 */
export type FanzoneWithDistance = FanzoneEntity & { distance?: number };

/**
 * FanzoneService
 *
 * Fan zone CRUD, geographic search, and anonymous crowd aggregation.
 *
 * Requirement: EF-08 — fan zones on a map.
 * Requirement: EF-09 — distance, capacity and broadcast teams in the listing.
 * Requirement: EF-11 — anonymous crowd aggregation.
 * Requirement: EF-12 — occupancy percentage.
 *
 * Team-existence checks live here rather than in the DTO layer: class-validator
 * has no database access, `create`/`update` are admin-only, and the service is
 * consumed directly by the recommendation and check-in modules, so validation
 * must not depend on a controller pipe having run.
 *
 * Distance is computed by PostGIS rather than in JavaScript. `location` is a
 * `geometry`, so every spatial expression casts to `::geography` — `ST_Distance`
 * on a bare `geometry(Point, 4326)` returns degrees, not metres. The extension
 * is installed by the EnablePostgis migration.
 */
@Injectable()
export class FanzoneService {
  constructor(
    @InjectRepository(FanzoneEntity)
    private readonly fanzoneRepository: Repository<FanzoneEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(CheckinEntity)
    private readonly checkinRepository: Repository<CheckinEntity>,
  ) {}

  /**
   * Resolves team ids to entities, asserting that every one of them exists.
   *
   * Returns the entities rather than just validating, so callers can assign them
   * to `fanzone.teams` — that assignment is what makes `save` write the
   * `fanzone_teams` join rows. Doing both in one query avoids a second lookup.
   *
   * Ids are de-duplicated first, so a repeated id does not read as a missing
   * team. A partially valid set is rejected wholesale.
   *
   * @throws {NotFoundException} if any id has no matching team.
   */
  private async resolveTeams(ids: string[]): Promise<TeamEntity[]> {
    const uniqueIds = [...new Set(ids)];
    const teams = await this.teamRepository.find({
      where: { id: In(uniqueIds) },
    });
    if (teams.length !== uniqueIds.length) {
      throw new NotFoundException('One or more teams not found');
    }
    return teams;
  }

  /**
   * Builds the value for the `location` column.
   *
   * GeoJSON rather than WKT, because that is what TypeORM's Postgres driver
   * expects for a spatial column — it stringifies this object into
   * `ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)`. See the note on
   * `FanzoneEntity.location`.
   *
   * Longitude comes first: GeoJSON orders coordinates x-then-y.
   */
  private toGeoJsonPoint(latitude: number, longitude: number): GeoJsonPoint {
    return { type: 'Point', coordinates: [longitude, latitude] };
  }

  /**
   * SQL for the distance in kilometres between `fanzone.location` and the
   * caller's coordinates (bound as `:lat` / `:lng`).
   *
   * Factored out so the expression exists once and cannot drift between the
   * SELECT list and the ORDER BY clause. Both casts are required: geography
   * distance is in metres on the spheroid, geometry distance would be in degrees.
   */
  private distanceKmExpression(): string {
    return (
      `ST_Distance(` +
      `fanzone.location::geography, ` +
      `ST_SetSRID(ST_MakePoint(:lng, :lat), ${SRID})::geography` +
      `) / ${METRES_PER_KILOMETRE}`
    );
  }

  /**
   * Creates a fan zone (admin-only).
   *
   * `availableSpots` starts at `capacity` — a fan zone with no check-ins is
   * entirely empty. The PostGIS point is derived from the supplied coordinates
   * so `location` and `latitude`/`longitude` cannot disagree.
   *
   * @throws {NotFoundException} if any supplied team id does not exist.
   */
  async create(dto: CreateFanzoneDto): Promise<FanzoneEntity> {
    const teams = await this.resolveTeams(dto.teamIds);

    const fanzone = this.fanzoneRepository.create({
      name: dto.name,
      description: dto.description,
      latitude: dto.latitude,
      longitude: dto.longitude,
      location: this.toGeoJsonPoint(dto.latitude, dto.longitude),
      capacity: dto.capacity,
      availableSpots: dto.capacity,
      address: dto.address,
      city: dto.city,
      openingHour: dto.openingHour,
      closingHour: dto.closingHour,
      teams,
    });

    const saved = await this.fanzoneRepository.save(fanzone);

    // Reload so the returned entity carries fresh team relations.
    return (await this.findById(saved.id))!;
  }

  /**
   * Lists fan zones, optionally filtered (EF-08, EF-09).
   *
   * Uses a QueryBuilder because filtering spans the joined teams relation and
   * the geographic predicate. Note that `teams` is declared `eager` on the
   * entity but QueryBuilder ignores eager relations, so it is joined and
   * selected explicitly.
   *
   * - `city` / `teamName`: case-insensitive partial matches.
   * - `minCapacity` / `maxCapacity`: inclusive bounds on `capacity`.
   * - `latitude` + `longitude` + `maxDistance`: restricts to the radius and
   *   orders closest-first, attaching `distance` in kilometres to each result.
   *   The three arrive together or not at all (`@RequiredTogether` on the DTO).
   *   Fan zones with a NULL `location` are excluded from a radius search;
   *   `create` always populates it.
   *
   * Without a geographic filter, results are ordered by name. With no filter at
   * all, every fan zone is returned.
   */
  async findAll(filter: FanzoneFilterDto = {}): Promise<FanzoneWithDistance[]> {
    const qb = this.fanzoneRepository
      .createQueryBuilder('fanzone')
      .leftJoinAndSelect('fanzone.teams', 'team');

    if (filter.city) {
      qb.andWhere('fanzone.city ILIKE :city', { city: `%${filter.city}%` });
    }

    if (filter.teamName) {
      // A second join under its own alias. Filtering on `team` — the alias the
      // results are hydrated from — would prune each fan zone's `teams` array
      // down to only the matching team.
      qb.innerJoin('fanzone.teams', 'filterTeam').andWhere(
        'filterTeam.name ILIKE :teamName',
        { teamName: `%${filter.teamName}%` },
      );
    }

    // `!== undefined` rather than truthiness: 0 is a legal bound.
    if (filter.minCapacity !== undefined) {
      qb.andWhere('fanzone.capacity >= :minCapacity', {
        minCapacity: filter.minCapacity,
      });
    }

    if (filter.maxCapacity !== undefined) {
      qb.andWhere('fanzone.capacity <= :maxCapacity', {
        maxCapacity: filter.maxCapacity,
      });
    }

    const hasLocationFilter =
      filter.latitude !== undefined &&
      filter.longitude !== undefined &&
      filter.maxDistance !== undefined;

    if (!hasLocationFilter) {
      return qb.orderBy('fanzone.name', 'ASC').getMany();
    }

    const distanceKm = this.distanceKmExpression();

    // ST_DWithin rather than `distance <= :max`: it is the form the GIST index
    // on `location` can serve. It takes metres, while the DTO is kilometres.
    qb.addSelect(distanceKm, 'distance_km')
      .andWhere(
        `ST_DWithin(` +
          `fanzone.location::geography, ` +
          `ST_SetSRID(ST_MakePoint(:lng, :lat), ${SRID})::geography, ` +
          `:radiusMetres` +
          `)`,
        {
          lat: filter.latitude,
          lng: filter.longitude,
          radiusMetres: filter.maxDistance! * METRES_PER_KILOMETRE,
        },
      )
      .orderBy(distanceKm, 'ASC');

    const { entities, raw } = await qb.getRawAndEntities<{
      fanzone_id: string;
      distance_km: string | number | null;
    }>();

    // The teams join yields one raw row per fan zone/team pair, so collapse to
    // the first distance seen for each id before attaching.
    const distanceById = new Map<string, number>();
    for (const row of raw) {
      if (row.distance_km !== null && !distanceById.has(row.fanzone_id)) {
        distanceById.set(row.fanzone_id, Number(row.distance_km));
      }
    }

    return entities.map((entity) => {
      const withDistance = entity as FanzoneWithDistance;
      withDistance.distance = distanceById.get(entity.id);
      return withDistance;
    });
  }

  /**
   * Fetches a single fan zone with its broadcast teams.
   *
   * @returns the fan zone, or `null` if no fan zone has the given id.
   */
  async findById(id: string): Promise<FanzoneEntity | null> {
    return this.fanzoneRepository.findOne({
      where: { id },
      relations: { teams: true },
    });
  }

  /**
   * Applies a partial update to a fan zone (admin-only).
   *
   * Only the fields present on the DTO are touched, with three derived effects:
   *
   * - A supplied `teamIds` **replaces** the team set, per the DTO contract.
   * - Supplying either coordinate regenerates `location`, filling the other half
   *   from the stored value — a longitude-only update must not leave a stale
   *   point. The stored coordinates come back from `pg` as strings (`numeric`),
   *   hence the `Number()`.
   * - A changed `capacity` shifts `availableSpots` by the same delta, so booked
   *   spots are preserved. The result is clamped to `0..capacity`: the lower
   *   bound stops a large shrink going negative, and the upper bound is there
   *   because more spots available than the venue holds is not a real state.
   * - An explicit `availableSpots` overrides that derived figure — see below.
   *
   * @throws {NotFoundException} if the fan zone, or a newly referenced team, is missing.
   */
  async update(id: string, dto: UpdateFanzoneDto): Promise<FanzoneEntity> {
    const fanzone = await this.findById(id);
    if (!fanzone) {
      throw new NotFoundException('Fan zone not found');
    }

    if (dto.teamIds !== undefined) {
      fanzone.teams = await this.resolveTeams(dto.teamIds);
    }

    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      const latitude = dto.latitude ?? Number(fanzone.latitude);
      const longitude = dto.longitude ?? Number(fanzone.longitude);
      fanzone.latitude = latitude;
      fanzone.longitude = longitude;
      fanzone.location = this.toGeoJsonPoint(latitude, longitude);
    }

    if (dto.capacity !== undefined) {
      const delta = fanzone.capacity - dto.capacity;
      fanzone.availableSpots = Math.min(
        Math.max(0, fanzone.availableSpots - delta),
        dto.capacity,
      );
      fanzone.capacity = dto.capacity;
    }

    // After the capacity arithmetic on purpose: an explicitly supplied value is
    // an admin correcting the count, so it wins over the figure derived from a
    // capacity change in the same request. Clamped to the *effective* capacity —
    // the new one when capacity moved too, otherwise the stored one.
    if (dto.availableSpots !== undefined) {
      fanzone.availableSpots = Math.min(dto.availableSpots, fanzone.capacity);
    }

    if (dto.name !== undefined) fanzone.name = dto.name;
    if (dto.description !== undefined) fanzone.description = dto.description;
    if (dto.address !== undefined) fanzone.address = dto.address;
    if (dto.city !== undefined) fanzone.city = dto.city;
    if (dto.openingHour !== undefined) fanzone.openingHour = dto.openingHour;
    if (dto.closingHour !== undefined) fanzone.closingHour = dto.closingHour;

    await this.fanzoneRepository.save(fanzone);

    // Reload so the returned entity carries fresh team relations.
    return (await this.findById(id))!;
  }

  /**
   * Aggregates the crowd currently at a fan zone, by supported team (EF-11).
   *
   * Anonymous by construction: the query selects a team name and a count and
   * nothing else. No user id or session token is read, grouped by, or returned,
   * so an individual's presence cannot be recovered from the response (ENF-05).
   *
   * "Currently present" means checked in within the last
   * CROWD_PRESENCE_WINDOW_HOURS hours — see the constant.
   *
   * The team join is written against the scalar `checkin.teamId` column rather
   * than traversing the relation, which also keeps CheckinEntity's `eager`
   * `fanzone` relation out of the query — following it would load a full fan
   * zone per check-in row.
   *
   * @returns the snapshot; `totalPresent: 0` with an empty `byTeam` when nobody
   *   is checked in. `occupancyPercentage` is always present — it derives from
   *   capacity, not from check-ins.
   * @throws {NotFoundException} if no fan zone has the given id.
   */
  async getCrowdStatus(id: string): Promise<CrowdStatusDto> {
    const fanzone = await this.findById(id);
    if (!fanzone) {
      throw new NotFoundException('Fan zone not found');
    }

    const rows = await this.checkinRepository
      .createQueryBuilder('checkin')
      .innerJoin(TeamEntity, 'team', 'team.id = checkin.teamId')
      .select('team.name', 'teamName')
      .addSelect('COUNT(*)::int', 'count')
      .where('checkin.fanzoneId = :id', { id })
      .andWhere('checkin.createdAt >= :since', {
        since: this.presenceWindowStart(),
      })
      .groupBy('team.name')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<{ teamName: string; count: number }>();

    return this.buildCrowdStatus(fanzone, rows);
  }

  /**
   * Crowd snapshots for a whole page of fan zones, in a single query.
   *
   * The list endpoint needs a snapshot per result. Calling `getCrowdStatus` in a
   * loop would cost two queries per fan zone — one aggregation plus the
   * `findById` it runs for its own 404 check — so this groups by fan zone id and
   * aggregates them all at once instead.
   *
   * Anonymity is identical to `getCrowdStatus`: fan zone id, team name and a
   * count, nothing per-user (EF-11, ENF-05).
   *
   * @returns a Map keyed by fan zone id, with an entry for **every** supplied fan
   *   zone — zones with no check-ins get a zeroed snapshot rather than being
   *   absent, so callers never handle a missing key.
   */
  async getCrowdStatusMany(
    fanzones: FanzoneEntity[],
  ): Promise<Map<string, CrowdStatusDto>> {
    // `IN ()` is not valid SQL, and an empty page needs no query at all.
    if (fanzones.length === 0) {
      return new Map();
    }

    const rows = await this.checkinRepository
      .createQueryBuilder('checkin')
      .innerJoin(TeamEntity, 'team', 'team.id = checkin.teamId')
      .select('checkin.fanzoneId', 'fanzoneId')
      .addSelect('team.name', 'teamName')
      .addSelect('COUNT(*)::int', 'count')
      .where('checkin.fanzoneId IN (:...ids)', {
        ids: fanzones.map((fanzone) => fanzone.id),
      })
      .andWhere('checkin.createdAt >= :since', {
        since: this.presenceWindowStart(),
      })
      .groupBy('checkin.fanzoneId')
      .addGroupBy('team.name')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<{ fanzoneId: string; teamName: string; count: number }>();

    const rowsByFanzone = new Map<
      string,
      { teamName: string; count: number }[]
    >();
    for (const row of rows) {
      const existing = rowsByFanzone.get(row.fanzoneId);
      if (existing) {
        existing.push(row);
      } else {
        rowsByFanzone.set(row.fanzoneId, [row]);
      }
    }

    return new Map(
      fanzones.map((fanzone) => [
        fanzone.id,
        this.buildCrowdStatus(fanzone, rowsByFanzone.get(fanzone.id) ?? []),
      ]),
    );
  }

  /**
   * Start of the presence window — check-ins older than this are stale.
   */
  private presenceWindowStart(): Date {
    return new Date(
      Date.now() - CROWD_PRESENCE_WINDOW_HOURS * MILLISECONDS_PER_HOUR,
    );
  }

  /**
   * Turns per-team counts into a CrowdStatusDto.
   *
   * Shared by the single and bulk aggregations so the totals, the percentages
   * and the occupancy figure cannot drift between the two paths.
   */
  private buildCrowdStatus(
    fanzone: FanzoneEntity,
    rows: { teamName: string; count: number }[],
  ): CrowdStatusDto {
    const totalPresent = rows.reduce((sum, row) => sum + Number(row.count), 0);

    const byTeam: TeamCrowdDto[] = rows.map((row) => {
      const count = Number(row.count);
      return {
        teamName: row.teamName,
        count,
        // One decimal place; keeps the shares summing to ~100 without
        // pretending to a precision the counts do not have.
        percentage:
          totalPresent === 0
            ? 0
            : Math.round((count / totalPresent) * 1000) / 10,
      };
    });

    return {
      totalPresent,
      byTeam,
      occupancyPercentage: this.getOccupancyPercentage(fanzone),
    };
  }

  /**
   * How full a fan zone is, 0 to 100 (EF-12).
   *
   * Derived from the booked spots (`capacity - availableSpots`) rather than from
   * check-ins, so it reflects reservations rather than attendance. Returns 0 for
   * a zero capacity instead of dividing by zero, and clamps the result in case
   * stored values ever fall outside `0..capacity`.
   */
  private getOccupancyPercentage(fanzone: FanzoneEntity): number {
    if (fanzone.capacity <= 0) {
      return 0;
    }
    const occupied = fanzone.capacity - fanzone.availableSpots;
    const percentage = Math.round((occupied / fanzone.capacity) * 100);
    return Math.min(Math.max(percentage, 0), 100);
  }
}
