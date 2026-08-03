import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';

import { CheckinEntity } from './entities/checkin.entity';
import { CreateCheckinDto, CrowdResponseDto } from './dto';
import { FanzoneEntity } from '../fanzone/entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import {
  CROWD_PRESENCE_WINDOW_HOURS,
  FanzoneService,
} from '../fanzone/fanzone.service';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * CheckinService
 *
 * Owns the check-in lifecycle: a fan arrives at a fan zone, and later leaves.
 * The rows it writes are what the crowd aggregation reads, so the guarantees
 * the crowd endpoints make about their numbers are enforced here, at write
 * time.
 *
 * Requirement: EF-10 — check in to, and out of, a fan zone.
 * Requirement: EF-11 — anonymous crowd aggregation (this side records the
 *   user id; nothing downstream ever reads it back out).
 * Requirement: EF-12 — occupancy, which derives from the `availableSpots`
 *   this service moves.
 * Requirement: ENF-05 — the only handle a client gets for a check-in is its
 *   `sessionToken`.
 *
 * Two kinds of dependency, for two different reasons:
 *
 * - **Repositories, for the write paths.** Taking them directly keeps provider
 *   resolution out of the `forwardRef` cycle FanzoneModule and CheckinModule
 *   already form, and — more importantly — lets the row and its spot delta be
 *   written through one transactional `EntityManager`. A service call could not
 *   join that transaction.
 * - **`FanzoneService`, for the read aggregation.** `getCrowdStatus` below
 *   delegates rather than re-implementing the GROUP BY, so the presence window,
 *   the percentage rule and the occupancy source cannot drift between this
 *   module's crowd endpoint and the fan zone module's. Plain injection is
 *   enough: `FanzoneService` depends only on repositories, so there is no
 *   provider cycle to break with `forwardRef`.
 *
 * Two properties of the design worth knowing before changing anything here:
 *
 * - **Occupancy and presence run on different clocks.** `availableSpots` is
 *   permanent until something releases it; the crowd count only sees the last
 *   CROWD_PRESENCE_WINDOW_HOURS hours. Nothing sweeps stale rows, so a zone
 *   whose check-ins have all aged out reports an empty crowd *and* full
 *   occupancy. `checkout` is currently the only thing that repairs that.
 * - **Checkout deletes the row.** That keeps the aggregation honest with no
 *   extra predicate, at the cost of the check-in disappearing from the fan's
 *   own history. Preserving it would mean a `checkedOutAt` column and an
 *   `IS NULL` guard in every query that counts check-ins.
 */
@Injectable()
export class CheckinService {
  constructor(
    @InjectRepository(CheckinEntity)
    private readonly checkinRepository: Repository<CheckinEntity>,
    @InjectRepository(FanzoneEntity)
    private readonly fanzoneRepository: Repository<FanzoneEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    private readonly fanzoneService: FanzoneService,
  ) {}

  /**
   * Start of the presence window — check-ins older than this are stale.
   *
   * Uses the constant exported by FanzoneService, so "currently present" means
   * the same thing to the duplicate guard below as it does to the aggregation
   * that reads these rows.
   */
  private presenceWindowStart(): Date {
    return new Date(
      Date.now() - CROWD_PRESENCE_WINDOW_HOURS * MILLISECONDS_PER_HOUR,
    );
  }

  /**
   * Whether a fan zone broadcasts a given team.
   *
   * Takes the **loaded fan zone** rather than its id, deliberately: every caller
   * already holds the entity — with `teams` hydrated by the relation's `eager`
   * flag — because it needs the same object for the capacity check and the spot
   * decrement. An id-taking version would re-query a row that is already in
   * memory, on the hot path of the one endpoint that has to be fast (EF-10).
   *
   * `teams` is defensively defaulted: a fan zone loaded with eager relations
   * suppressed would otherwise throw here rather than simply reporting that it
   * broadcasts nothing.
   */
  private validateTeamAtFanzone(
    fanzone: Pick<FanzoneEntity, 'teams'>,
    teamId: string,
  ): boolean {
    return (fanzone.teams ?? []).some((broadcast) => broadcast.id === teamId);
  }

  /**
   * Checks a fan in to a fan zone in support of one team (EF-10).
   *
   * `userId` comes from the verified JWT, never from the request body.
   *
   * Four rejections, each protecting a property of the crowd figures:
   *
   * - the team must be broadcast at that fan zone, so a breakdown cannot list a
   *   team the venue is not showing;
   * - the zone must have a spot left;
   * - the same user cannot check in to the same zone twice inside the presence
   *   window — without this one account could inflate a count arbitrarily, and
   *   the percentages would stop describing people.
   *
   * The `sessionToken` is generated server-side. It is the only handle the
   * client gets back (ENF-05).
   *
   * `availableSpots` is decremented as part of the same transaction as the
   * insert: occupancy derives from `capacity - availableSpots`, so a check-in
   * saved without its decrement would leave a fan zone reporting 0% occupancy no
   * matter how many people walked in.
   *
   * @throws {NotFoundException} if the fan zone or the team does not exist.
   * @throws {BadRequestException} if the team is not broadcast there, the zone is
   *   full, or the user is already checked in.
   */
  async create(userId: string, dto: CreateCheckinDto): Promise<CheckinEntity> {
    // `teams` is eager on FanzoneEntity, so the broadcast check below needs no
    // second query.
    const fanzone = await this.fanzoneRepository.findOne({
      where: { id: dto.fanzoneId },
    });
    if (!fanzone) {
      throw new NotFoundException('Fan zone not found');
    }

    const team = await this.teamRepository.findOne({
      where: { id: dto.teamId },
    });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (!this.validateTeamAtFanzone(fanzone, team.id)) {
      throw new BadRequestException(
        'That team is not broadcast at this fan zone',
      );
    }

    if (fanzone.availableSpots <= 0) {
      throw new BadRequestException('Fan zone is full');
    }

    const alreadyPresent = await this.checkinRepository.findOne({
      where: {
        userId,
        fanzoneId: fanzone.id,
        createdAt: MoreThanOrEqual(this.presenceWindowStart()),
      },
    });
    if (alreadyPresent) {
      throw new BadRequestException('Already checked in to this fan zone');
    }

    return this.checkinRepository.manager.transaction(async (manager) => {
      const checkin = manager.create(CheckinEntity, {
        userId,
        fanzoneId: fanzone.id,
        teamId: team.id,
        sessionToken: randomUUID(),
      });

      const saved = await manager.save(checkin);

      // Attach the relations already in hand. `save` returns the entity as it
      // was passed in, with no relations hydrated, and the response DTO needs
      // the team *name* — so this saves a reload the two lookups above have
      // already paid for. Assigned after the save so it cannot affect what is
      // persisted.
      saved.fanzone = fanzone;
      saved.team = team;

      await manager.update(FanzoneEntity, fanzone.id, {
        // Floored at 0. The full-check above already refuses a zone with no
        // spots left, so the floor only bites if the stored value has drifted
        // negative — belt and braces on a column occupancy is derived from.
        availableSpots: Math.max(0, fanzone.availableSpots - 1),
      });

      return saved;
    });
  }

  /**
   * Checks a fan out of a fan zone, releasing the spot they took (EF-10).
   *
   * `userId` comes from the verified JWT: a caller can only ever remove their
   * own check-in. `fanzoneId` comes from the request and is a **guard**, not a
   * lookup key — the token alone identifies the row, so requiring the fan zone
   * to match stops a client holding a stale token from freeing a spot at the
   * wrong venue and corrupting that zone's occupancy figure.
   *
   * Deliberately **not** bounded by the presence window. A check-in older than
   * CROWD_PRESENCE_WINDOW_HOURS has aged out of the crowd count but still holds
   * its spot, and nothing sweeps those rows — so this is the only thing that
   * ever gives the spot back. Refusing a stale checkout would make that leak
   * permanent.
   *
   * @throws {NotFoundException} if no check-in has that session token.
   * @throws {ForbiddenException} if the check-in belongs to another user.
   * @throws {BadRequestException} if the check-in is not for that fan zone.
   */
  async checkout(
    userId: string,
    sessionToken: string,
    fanzoneId: string,
  ): Promise<void> {
    // Three columns, eager relations off: the validation below needs the owner
    // and the fan zone id, and nothing else. A plain `findOne` would hydrate the
    // eager `fanzone` — and, through it, the eager `fanzone.teams` — plus the
    // team, for values this method never reads.
    const checkin = await this.checkinRepository.findOne({
      where: { sessionToken },
      select: { id: true, userId: true, fanzoneId: true },
      loadEagerRelations: false,
    });
    if (!checkin) {
      throw new NotFoundException('Check-in not found');
    }

    if (checkin.userId !== userId) {
      throw new ForbiddenException('That check-in belongs to another user');
    }

    // Compared case-insensitively. `@IsUUID('all')` accepts an uppercase UUID
    // and Postgres stores it lowercase, so a literal comparison would reject a
    // perfectly valid checkout — and leave the spot locked, since nothing else
    // releases it.
    if (checkin.fanzoneId.toLowerCase() !== fanzoneId.toLowerCase()) {
      throw new BadRequestException('That check-in is not for this fan zone');
    }

    await this.checkinRepository.manager.transaction(async (manager) => {
      // Delete first, and let its row count decide whether to release the spot.
      // Two concurrent checkouts of the same token both pass the validation
      // above; without this gate both would increment, and one check-in would
      // free two spots.
      const { affected } = await manager.delete(CheckinEntity, {
        id: checkin.id,
      });
      if (!affected) {
        return;
      }

      // Re-read inside the transaction, and only the two numbers involved.
      // Addressed by the **stored** fan zone id rather than the one supplied —
      // the two are validated equal, but the guard above exists precisely so a
      // client's value never picks the venue whose count moves.
      const fanzone = await manager.findOne(FanzoneEntity, {
        where: { id: checkin.fanzoneId },
        select: { id: true, capacity: true, availableSpots: true },
        loadEagerRelations: false,
      });
      if (!fanzone) {
        // Unreachable: the FK cascades, so a check-in cannot outlive its fan
        // zone. Bailing out beats writing to an id that is no longer there.
        return;
      }

      await manager.update(FanzoneEntity, fanzone.id, {
        // Capped at capacity, mirroring the floor `create` puts at 0. An admin
        // can lower `availableSpots` (or shrink `capacity`, which clamps it)
        // between a check-in and its checkout, and without the cap the release
        // would push the stored value above capacity — where it is invisible in
        // `occupancyPercentage`, which clamps its own output, yet still lets the
        // zone admit more fans than it holds.
        availableSpots: Math.min(fanzone.capacity, fanzone.availableSpots + 1),
      });
    });
  }

  /**
   * Every check-in belonging to one fan, newest first (EF-10).
   *
   * `userId` comes from the verified JWT, so a fan only ever sees their own —
   * that, plus a projection carrying no user identifier, is what keeps a
   * per-person listing inside ENF-05.
   *
   * Not window-bounded: this is history, and it is also how a fan recovers a
   * `sessionToken` they lost — which is the only way to free the spot that
   * check-in is still holding.
   *
   * Built with a QueryBuilder rather than `find` on purpose. `find` honours
   * `eager`, and `CheckinEntity.fanzone` → `FanzoneEntity.teams` is a chain of
   * eager relations ending in a many-to-many: one `find` would join
   * `checkins → fanzones → fanzone_teams → teams`, multiplying rows by each
   * zone's broadcast-team count and dragging the PostGIS `location` along for
   * every one. A QueryBuilder ignores eager relations, so this stays a single
   * flat query selecting only the columns the response needs.
   *
   * @returns the fan's check-ins with `fanzone` and `team` partially hydrated;
   *   an empty array if they have none.
   */
  async getUserCheckIns(userId: string): Promise<CheckinEntity[]> {
    return (
      this.checkinRepository
        .createQueryBuilder('checkin')
        .innerJoin('checkin.fanzone', 'fanzone')
        .innerJoin('checkin.team', 'team')
        .select([
          'checkin.id',
          'checkin.sessionToken',
          'checkin.fanzoneId',
          'checkin.createdAt',
        ])
        .addSelect([
          'fanzone.id',
          'fanzone.name',
          'fanzone.city',
          'fanzone.address',
          'team.id',
          'team.name',
        ])
        .where('checkin.userId = :userId', { userId })
        .orderBy('checkin.createdAt', 'DESC')
        // Timestamps can collide; the id keeps the order total, so paging or
        // repeated calls cannot shuffle two check-ins made in the same instant.
        .addOrderBy('checkin.id', 'DESC')
        .getMany()
    );
  }

  /**
   * The crowd at a fan zone: how many people, split by the team they support
   * (EF-11), alongside how full the venue is (EF-12).
   *
   * Delegates the aggregation to `FanzoneService` rather than repeating it. That
   * query carries several decisions that have to hold identically wherever crowd
   * figures appear — the presence window, the one-decimal percentage rule, the
   * zero-total guard, and occupancy deriving from spots rather than from
   * check-ins. A second copy here would be free to drift from all four.
   *
   * Anonymity therefore comes from the same place it always has: the aggregation
   * selects a team name and a count, and never reads a user column (ENF-05).
   *
   * @returns the snapshot, tagged with the fan zone it describes and the moment
   *   it was computed — `updatedAt` is generated per response because the
   *   aggregation is a live query, not a stored row.
   * @throws {NotFoundException} if no fan zone has the given id.
   */
  async getCrowdStatus(fanzoneId: string): Promise<CrowdResponseDto> {
    const status = await this.fanzoneService.getCrowdStatus(fanzoneId);

    return {
      ...status,
      fanzoneId,
      // `new Date(Date.now())` rather than `new Date()`: the argless constructor
      // reads the clock directly and ignores a mocked `Date.now`, which is how
      // the specs here freeze time.
      updatedAt: new Date(Date.now()).toISOString(),
    };
  }
}
