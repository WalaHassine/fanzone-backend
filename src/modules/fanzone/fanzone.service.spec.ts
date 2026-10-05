import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator, ObjectLiteral, Repository } from 'typeorm';

import { FanzoneService } from './fanzone.service';
import { FanzoneEntity } from './entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { CheckinEntity } from '../checkin/entities/checkin.entity';

const FANZONE_ID = 'fanzone-uuid-a';
const OTHER_FANZONE_ID = 'fanzone-uuid-b';
const TEAM_ID = 'team-uuid-a';
const OTHER_TEAM_ID = 'team-uuid-b';
const CREATED_AT = new Date('2026-07-27T10:15:00.000Z');

const LATITUDE = 25.2854;
const LONGITUDE = 51.531;

type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<
    Repository<T>,
    'findOne' | 'find' | 'create' | 'save' | 'createQueryBuilder'
  >
>;

/**
 * Chainable QueryBuilder stub. Every builder method records its arguments and
 * returns the same object, so a test can assert on the exact SQL fragment and
 * parameters the service passed. The terminals resolve whatever the test seeds.
 */

/** A builder method that returns the builder; `calls` is typed loosely on purpose. */
type ChainMock = jest.Mock<QbMock, unknown[]>;
/** A builder method that executes the query. */
type TerminalMock = jest.Mock<Promise<unknown>, unknown[]>;

type QbMock = {
  select: ChainMock;
  addSelect: ChainMock;
  leftJoinAndSelect: ChainMock;
  innerJoin: ChainMock;
  where: ChainMock;
  andWhere: ChainMock;
  groupBy: ChainMock;
  orderBy: ChainMock;
  limit: ChainMock;
  setParameters: ChainMock;
  getMany: TerminalMock;
  getRawAndEntities: TerminalMock;
  getRawMany: TerminalMock;
  getOne: TerminalMock;
};

function makeQb(): QbMock {
  const qb = {} as QbMock;
  for (const method of [
    'select',
    'addSelect',
    'leftJoinAndSelect',
    'innerJoin',
    'where',
    'andWhere',
    'groupBy',
    'orderBy',
    'limit',
    'setParameters',
  ] as const) {
    qb[method] = jest.fn(() => qb) as ChainMock;
  }
  const terminal = (resolved: unknown): TerminalMock =>
    jest.fn().mockResolvedValue(resolved) as TerminalMock;

  qb.getMany = terminal([]);
  qb.getRawAndEntities = terminal({ entities: [], raw: [] });
  qb.getRawMany = terminal([]);
  qb.getOne = terminal(null);
  return qb;
}

/** Concatenates every SQL fragment the builder received, for substring assertions. */
function sqlOf(qb: QbMock): string {
  return [
    ...qb.select.mock.calls,
    ...qb.addSelect.mock.calls,
    ...qb.innerJoin.mock.calls,
    ...qb.leftJoinAndSelect.mock.calls,
    ...qb.where.mock.calls,
    ...qb.andWhere.mock.calls,
    ...qb.groupBy.mock.calls,
    ...qb.orderBy.mock.calls,
  ]
    .flat()
    .filter((arg): arg is string => typeof arg === 'string')
    .join(' | ');
}

/** All parameter objects merged, for asserting on bound values. */
function paramsOf(qb: QbMock): Record<string, unknown> {
  return [...qb.where.mock.calls, ...qb.andWhere.mock.calls].reduce(
    (acc: Record<string, unknown>, call) => {
      const params = call[1] as Record<string, unknown> | undefined;
      return params ? { ...acc, ...params } : acc;
    },
    {},
  );
}

describe('FanzoneService', () => {
  let service: FanzoneService;
  let fanzoneRepo: RepoMock<FanzoneEntity>;
  let teamRepo: RepoMock<TeamEntity>;
  let checkinRepo: RepoMock<CheckinEntity>;

  function makeTeam(overrides: Partial<TeamEntity> = {}): TeamEntity {
    return {
      id: TEAM_ID,
      name: 'France',
      code: 'FRA',
      flag: null,
      createdAt: CREATED_AT,
      ...overrides,
    } as unknown as TeamEntity;
  }

  /** Builds a persisted-looking fan zone. */
  function makeFanzone(overrides: Partial<FanzoneEntity> = {}): FanzoneEntity {
    return {
      id: FANZONE_ID,
      name: 'Doha Corniche Fan Zone',
      description: 'Open-air zone on the Corniche.',
      latitude: LATITUDE,
      longitude: LONGITUDE,
      location: { type: 'Point', coordinates: [LONGITUDE, LATITUDE] },
      capacity: 5000,
      availableSpots: 5000,
      address: 'Al Corniche Street, Doha',
      city: 'Doha',
      openingHour: '18:00',
      closingHour: '00:00',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      teams: [makeTeam()],
      ...overrides,
    } as FanzoneEntity;
  }

  /** Seeds the fanzone QueryBuilder and hands the stub back for assertions. */
  function stubFanzoneQb(): QbMock {
    const qb = makeQb();
    fanzoneRepo.createQueryBuilder.mockReturnValue(qb as never);
    return qb;
  }

  /** Seeds the checkin QueryBuilder with the given aggregation rows. */
  function stubCheckinQb(rows: { teamName: string; count: number }[]): QbMock {
    const qb = makeQb();
    qb.getRawMany.mockResolvedValue(rows);
    checkinRepo.createQueryBuilder.mockReturnValue(qb as never);
    return qb;
  }

  const createDto = {
    name: 'Doha Corniche Fan Zone',
    description: 'Open-air zone on the Corniche.',
    latitude: LATITUDE,
    longitude: LONGITUDE,
    capacity: 5000,
    address: 'Al Corniche Street, Doha',
    city: 'Doha',
    openingHour: '18:00',
    closingHour: '00:00',
    teamIds: [TEAM_ID],
  };

  beforeEach(async () => {
    const emptyRepo = (): RepoMock<ObjectLiteral> => ({
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    });

    fanzoneRepo = emptyRepo() as RepoMock<FanzoneEntity>;
    teamRepo = emptyRepo() as RepoMock<TeamEntity>;
    checkinRepo = emptyRepo() as RepoMock<CheckinEntity>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FanzoneService,
        { provide: getRepositoryToken(FanzoneEntity), useValue: fanzoneRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
        { provide: getRepositoryToken(CheckinEntity), useValue: checkinRepo },
      ],
    }).compile();

    service = module.get<FanzoneService>(FanzoneService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    it('builds the PostGIS point with longitude first and starts empty', async () => {
      const teams = [makeTeam()];
      teamRepo.find.mockResolvedValue(teams);
      const built = makeFanzone();
      fanzoneRepo.create.mockReturnValue(built);
      fanzoneRepo.save.mockResolvedValue(built);
      fanzoneRepo.findOne.mockResolvedValue(built);

      const result = await service.create(createDto);

      expect(fanzoneRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          location: { type: 'Point', coordinates: [LONGITUDE, LATITUDE] },
          availableSpots: 5000,
          capacity: 5000,
          teams,
        }),
      );
      expect(fanzoneRepo.save).toHaveBeenCalledWith(built);
      expect(result).toBe(built);
    });

    it('reloads through findById so team relations are fresh', async () => {
      teamRepo.find.mockResolvedValue([makeTeam()]);
      fanzoneRepo.create.mockReturnValue(makeFanzone());
      fanzoneRepo.save.mockResolvedValue(makeFanzone());
      const reloaded = makeFanzone({ name: 'reloaded' });
      fanzoneRepo.findOne.mockResolvedValue(reloaded);

      const result = await service.create(createDto);

      expect(fanzoneRepo.findOne).toHaveBeenCalledWith({
        where: { id: FANZONE_ID },
        relations: { teams: true },
      });
      expect(result).toBe(reloaded);
    });

    it('de-duplicates team ids before the existence check', async () => {
      teamRepo.find.mockResolvedValue([makeTeam()]);
      fanzoneRepo.create.mockReturnValue(makeFanzone());
      fanzoneRepo.save.mockResolvedValue(makeFanzone());
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());

      await service.create({ ...createDto, teamIds: [TEAM_ID, TEAM_ID] });

      // One unique id requested, one team found -> not a mismatch.
      const where = teamRepo.find.mock.calls[0][0]?.where as {
        id: FindOperator<string>;
      };
      expect(where.id.value).toEqual([TEAM_ID]);
      expect(fanzoneRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException and does not save when a team is missing', async () => {
      teamRepo.find.mockResolvedValue([makeTeam()]); // one of two requested

      await expect(
        service.create({ ...createDto, teamIds: [TEAM_ID, OTHER_TEAM_ID] }),
      ).rejects.toThrow(NotFoundException);
      expect(fanzoneRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('joins and selects teams, ordering by name with no filter', async () => {
      const qb = stubFanzoneQb();
      const rows = [makeFanzone()];
      qb.getMany.mockResolvedValue(rows);

      const result = await service.findAll();

      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'fanzone.teams',
        'team',
      );
      expect(qb.orderBy).toHaveBeenCalledWith('fanzone.name', 'ASC');
      expect(qb.getMany).toHaveBeenCalled();
      expect(result).toBe(rows);
    });

    it('filters city with a case-insensitive partial match', async () => {
      const qb = stubFanzoneQb();

      await service.findAll({ city: 'doha' });

      expect(qb.andWhere).toHaveBeenCalledWith('fanzone.city ILIKE :city', {
        city: '%doha%',
      });
    });

    it('filters teamName through a join aliased apart from the hydration join', async () => {
      const qb = stubFanzoneQb();

      await service.findAll({ teamName: 'fran' });

      expect(qb.innerJoin).toHaveBeenCalledWith('fanzone.teams', 'filterTeam');
      expect(qb.andWhere).toHaveBeenCalledWith(
        'filterTeam.name ILIKE :teamName',
        {
          teamName: '%fran%',
        },
      );
      // The alias the results hydrate from is never filtered on.
      expect(sqlOf(qb)).not.toContain('team.name ILIKE');
    });

    it('applies both capacity bounds', async () => {
      const qb = stubFanzoneQb();

      await service.findAll({ minCapacity: 1000, maxCapacity: 10000 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'fanzone.capacity >= :minCapacity',
        {
          minCapacity: 1000,
        },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'fanzone.capacity <= :maxCapacity',
        {
          maxCapacity: 10000,
        },
      );
    });

    it('treats a capacity bound of 0 as present, not absent', async () => {
      const qb = stubFanzoneQb();

      await service.findAll({ minCapacity: 0 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'fanzone.capacity >= :minCapacity',
        {
          minCapacity: 0,
        },
      );
    });

    describe('with a location filter', () => {
      const filter = {
        latitude: LATITUDE,
        longitude: LONGITUDE,
        maxDistance: 5,
      };

      it('selects the distance in km, casting to geography', async () => {
        const qb = stubFanzoneQb();

        await service.findAll(filter);

        const [expression, alias] = qb.addSelect.mock.calls[0] as [
          string,
          string,
        ];
        expect(alias).toBe('distance_km');
        expect(expression).toContain('ST_Distance(');
        expect(expression).toContain('fanzone.location::geography');
        expect(expression).toContain(
          'ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography',
        );
        expect(expression).toContain('/ 1000');
      });

      it('bounds the search with ST_DWithin in metres', async () => {
        const qb = stubFanzoneQb();

        await service.findAll(filter);

        expect(sqlOf(qb)).toContain('ST_DWithin(');
        expect(paramsOf(qb)).toEqual(
          expect.objectContaining({
            lat: LATITUDE,
            lng: LONGITUDE,
            radiusMetres: 5000, // 5 km
          }),
        );
      });

      it('orders closest-first by the same distance expression', async () => {
        const qb = stubFanzoneQb();

        await service.findAll(filter);

        const [selected] = qb.addSelect.mock.calls[0] as [string];
        expect(qb.orderBy).toHaveBeenCalledWith(selected, 'ASC');
        expect(qb.orderBy).not.toHaveBeenCalledWith('fanzone.name', 'ASC');
      });

      it('attaches the distance to each entity, collapsing duplicate raw rows', async () => {
        const qb = stubFanzoneQb();
        const near = makeFanzone({ id: FANZONE_ID });
        const far = makeFanzone({ id: OTHER_FANZONE_ID });
        qb.getRawAndEntities.mockResolvedValue({
          entities: [near, far],
          raw: [
            // Two rows for the first fan zone: it broadcasts two teams.
            { fanzone_id: FANZONE_ID, distance_km: '1.25' },
            { fanzone_id: FANZONE_ID, distance_km: '1.25' },
            { fanzone_id: OTHER_FANZONE_ID, distance_km: '4.5' },
          ],
        });

        const result = await service.findAll(filter);

        expect(result).toHaveLength(2);
        expect(result[0].distance).toBe(1.25);
        expect(result[1].distance).toBe(4.5);
      });

      it('leaves distance undefined when the raw value is null', async () => {
        const qb = stubFanzoneQb();
        const fanzone = makeFanzone();
        qb.getRawAndEntities.mockResolvedValue({
          entities: [fanzone],
          raw: [{ fanzone_id: FANZONE_ID, distance_km: null }],
        });

        const result = await service.findAll(filter);

        expect(result[0].distance).toBeUndefined();
      });

      it('ignores a partial location filter (no ST_DWithin, name ordering)', async () => {
        const qb = stubFanzoneQb();

        await service.findAll({ latitude: LATITUDE, longitude: LONGITUDE });

        expect(sqlOf(qb)).not.toContain('ST_DWithin');
        expect(qb.orderBy).toHaveBeenCalledWith('fanzone.name', 'ASC');
        expect(qb.getMany).toHaveBeenCalled();
      });
    });
  });

  describe('findWithDistanceFrom', () => {
    it('ranks by distance without a radius filter and bounds the result', async () => {
      const qb = stubFanzoneQb();
      qb.getRawMany.mockResolvedValue([{ id: FANZONE_ID, distance_km: '3.2' }]);
      fanzoneRepo.find.mockResolvedValue([makeFanzone()]);

      await service.findWithDistanceFrom(LATITUDE, LONGITUDE, { limit: 10 });

      expect(sqlOf(qb)).toContain('ST_Distance');
      // A radius would exclude the only zone available to a remote fan.
      expect(sqlOf(qb)).not.toContain('ST_DWithin');
      expect(qb.limit).toHaveBeenCalledWith(10);
      expect(qb.setParameters).toHaveBeenCalledWith({
        lat: LATITUDE,
        lng: LONGITUDE,
      });
    });

    it('excludes fan zones that have no location', async () => {
      const qb = stubFanzoneQb();
      qb.getRawMany.mockResolvedValue([]);

      await service.findWithDistanceFrom(LATITUDE, LONGITUDE);

      expect(sqlOf(qb)).toContain('location IS NOT NULL');
    });

    it('attaches the distance and preserves the nearest-first ordering', async () => {
      const other = 'c3d4e5f6-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
      const qb = stubFanzoneQb();
      qb.getRawMany.mockResolvedValue([
        { id: other, distance_km: '1.5' },
        { id: FANZONE_ID, distance_km: '9.75' },
      ]);
      // `find` does not preserve the ranking, so the service must reorder.
      fanzoneRepo.find.mockResolvedValue([
        makeFanzone(),
        makeFanzone({ id: other }),
      ]);

      const result = await service.findWithDistanceFrom(LATITUDE, LONGITUDE);

      expect(result.map((zone) => zone.id)).toEqual([other, FANZONE_ID]);
      expect(result.map((zone) => zone.distance)).toEqual([1.5, 9.75]);
    });

    it('restricts to the given ids and drops the limit when they are supplied', async () => {
      const qb = stubFanzoneQb();
      qb.getRawMany.mockResolvedValue([{ id: FANZONE_ID, distance_km: '3.2' }]);
      fanzoneRepo.find.mockResolvedValue([makeFanzone()]);

      await service.findWithDistanceFrom(LATITUDE, LONGITUDE, {
        fanzoneIds: [FANZONE_ID],
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('fanzone.id IN'),
        { fanzoneIds: [FANZONE_ID] },
      );
      // A LIMIT on top of an explicit id list could drop the zone asked about.
      expect(qb.limit).not.toHaveBeenCalled();
    });

    it('returns nothing, and queries nothing, for an empty id list', async () => {
      const result = await service.findWithDistanceFrom(LATITUDE, LONGITUDE, {
        fanzoneIds: [],
      });

      expect(result).toEqual([]);
      expect(fanzoneRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('skips the entity read when no fan zone ranked', async () => {
      const qb = stubFanzoneQb();
      qb.getRawMany.mockResolvedValue([]);

      const result = await service.findWithDistanceFrom(LATITUDE, LONGITUDE);

      expect(result).toEqual([]);
      expect(fanzoneRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('loads the teams relation', async () => {
      const fanzone = makeFanzone();
      fanzoneRepo.findOne.mockResolvedValue(fanzone);

      const result = await service.findById(FANZONE_ID);

      expect(fanzoneRepo.findOne).toHaveBeenCalledWith({
        where: { id: FANZONE_ID },
        relations: { teams: true },
      });
      expect(result).toBe(fanzone);
    });

    it('returns null when the fan zone does not exist', async () => {
      fanzoneRepo.findOne.mockResolvedValue(null);
      expect(await service.findById(FANZONE_ID)).toBeNull();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the fan zone is missing', async () => {
      fanzoneRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(FANZONE_ID, { city: 'Doha' }),
      ).rejects.toThrow(NotFoundException);
      expect(fanzoneRepo.save).not.toHaveBeenCalled();
    });

    it('applies only the fields present on the DTO', async () => {
      const existing = makeFanzone();
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { city: 'Lusail' });

      expect(existing.city).toBe('Lusail');
      expect(existing.name).toBe('Doha Corniche Fan Zone'); // untouched
      expect(fanzoneRepo.save).toHaveBeenCalledWith(existing);
    });

    it('replaces the team set and rejects an unknown team id', async () => {
      const existing = makeFanzone();
      fanzoneRepo.findOne.mockResolvedValue(existing);
      teamRepo.find.mockResolvedValue([]); // requested id not found

      await expect(
        service.update(FANZONE_ID, { teamIds: [OTHER_TEAM_ID] }),
      ).rejects.toThrow(NotFoundException);
      expect(fanzoneRepo.save).not.toHaveBeenCalled();
    });

    it('assigns the resolved teams when the ids are valid', async () => {
      const existing = makeFanzone();
      fanzoneRepo.findOne.mockResolvedValue(existing);
      const teams = [makeTeam({ id: OTHER_TEAM_ID, name: 'Tunisia' })];
      teamRepo.find.mockResolvedValue(teams);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { teamIds: [OTHER_TEAM_ID] });

      expect(existing.teams).toBe(teams);
    });

    it('regenerates the point when both coordinates change', async () => {
      const existing = makeFanzone();
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { latitude: 25.4, longitude: 51.6 });

      expect(existing.location).toEqual({
        type: 'Point',
        coordinates: [51.6, 25.4],
      });
    });

    it('fills the missing half from the stored value on a longitude-only update', async () => {
      // `numeric` comes back from pg as a string — the service must coerce it.
      const existing = makeFanzone({
        latitude: '25.28540000' as unknown as number,
      });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { longitude: 51.6 });

      expect(existing.location).toEqual({
        type: 'Point',
        coordinates: [51.6, 25.2854],
      });
      expect(existing.latitude).toBe(25.2854);
    });

    it('leaves the point alone when neither coordinate is supplied', async () => {
      const existing = makeFanzone();
      const original = existing.location;
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { name: 'Renamed' });

      expect(existing.location).toBe(original);
    });

    it('shifts availableSpots by the capacity delta when capacity grows', async () => {
      // 5000 capacity, 1000 booked -> 4000 available.
      const existing = makeFanzone({ capacity: 5000, availableSpots: 4000 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { capacity: 6000 });

      expect(existing.capacity).toBe(6000);
      expect(existing.availableSpots).toBe(5000); // the 1000 booked are preserved
    });

    it('shifts availableSpots down when capacity shrinks', async () => {
      const existing = makeFanzone({ capacity: 5000, availableSpots: 4000 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { capacity: 4500 });

      expect(existing.availableSpots).toBe(3500);
    });

    it('floors availableSpots at 0 rather than going negative', async () => {
      const existing = makeFanzone({ capacity: 5000, availableSpots: 100 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { capacity: 1000 });

      expect(existing.availableSpots).toBe(0);
    });

    it('caps availableSpots at the new capacity', async () => {
      // Nothing booked; a shrink must not leave more spots than the venue holds.
      const existing = makeFanzone({ capacity: 5000, availableSpots: 5000 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { capacity: 20 });

      expect(existing.availableSpots).toBe(20);
    });

    it('sets availableSpots explicitly when supplied on its own', async () => {
      const existing = makeFanzone({ capacity: 100, availableSpots: 100 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { availableSpots: 70 });

      expect(existing.availableSpots).toBe(70);
      expect(existing.capacity).toBe(100); // untouched
    });

    it('accepts an explicit availableSpots of 0', async () => {
      const existing = makeFanzone({ capacity: 100, availableSpots: 40 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { availableSpots: 0 });

      expect(existing.availableSpots).toBe(0);
    });

    it('lets an explicit availableSpots win over the capacity-derived value', async () => {
      // The delta arithmetic alone would give 900; the explicit value overrides it.
      const existing = makeFanzone({ capacity: 5000, availableSpots: 4000 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { capacity: 1000, availableSpots: 250 });

      expect(existing.capacity).toBe(1000);
      expect(existing.availableSpots).toBe(250);
    });

    it('clamps an explicit availableSpots to the new capacity', async () => {
      const existing = makeFanzone({ capacity: 5000, availableSpots: 4000 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { capacity: 100, availableSpots: 900 });

      expect(existing.availableSpots).toBe(100);
    });

    it('clamps an explicit availableSpots to the stored capacity when capacity is unchanged', async () => {
      const existing = makeFanzone({ capacity: 100, availableSpots: 50 });
      fanzoneRepo.findOne.mockResolvedValue(existing);
      fanzoneRepo.save.mockResolvedValue(existing);

      await service.update(FANZONE_ID, { availableSpots: 400 });

      expect(existing.availableSpots).toBe(100);
    });

    it('reloads through findById so team relations reflect the update', async () => {
      const existing = makeFanzone();
      const reloaded = makeFanzone({ name: 'reloaded' });
      fanzoneRepo.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(reloaded);
      fanzoneRepo.save.mockResolvedValue(existing);

      const result = await service.update(FANZONE_ID, { name: 'Renamed' });

      expect(result).toBe(reloaded);
    });
  });

  describe('getCrowdStatus', () => {
    it('throws NotFoundException when the fan zone is missing', async () => {
      fanzoneRepo.findOne.mockResolvedValue(null);

      await expect(service.getCrowdStatus(FANZONE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('aggregates counts and percentages per team', async () => {
      fanzoneRepo.findOne.mockResolvedValue(
        makeFanzone({ capacity: 5000, availableSpots: 3200 }),
      );
      stubCheckinQb([
        { teamName: 'France', count: 480 },
        { teamName: 'Tunisia', count: 320 },
      ]);

      const result = await service.getCrowdStatus(FANZONE_ID);

      expect(result.totalPresent).toBe(800);
      expect(result.byTeam).toEqual([
        { teamName: 'France', count: 480, percentage: 60 },
        { teamName: 'Tunisia', count: 320, percentage: 40 },
      ]);
      expect(result.occupancyPercentage).toBe(36); // (5000-3200)/5000
    });

    it('produces percentages that sum to ~100 for uneven splits', async () => {
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());
      stubCheckinQb([
        { teamName: 'France', count: 1 },
        { teamName: 'Tunisia', count: 1 },
        { teamName: 'Brazil', count: 1 },
      ]);

      const { byTeam } = await service.getCrowdStatus(FANZONE_ID);

      const total = byTeam.reduce((sum, team) => sum + team.percentage, 0);
      expect(total).toBeCloseTo(100, 0);
      expect(byTeam[0].percentage).toBe(33.3);
    });

    it('bounds the aggregation to the presence window and this fan zone', async () => {
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());
      const now = new Date('2026-07-27T20:00:00.000Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      const qb = stubCheckinQb([]);

      await service.getCrowdStatus(FANZONE_ID);

      expect(qb.where).toHaveBeenCalledWith('checkin.fanzoneId = :id', {
        id: FANZONE_ID,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('checkin.createdAt >= :since', {
        since: new Date('2026-07-27T16:00:00.000Z'), // 4-hour window
      });
      expect(qb.groupBy).toHaveBeenCalledWith('team.name');
    });

    it('joins teams on the scalar teamId column, not the relation', async () => {
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());
      const qb = stubCheckinQb([]);

      await service.getCrowdStatus(FANZONE_ID);

      expect(qb.innerJoin).toHaveBeenCalledWith(
        TeamEntity,
        'team',
        'team.id = checkin.teamId',
      );
    });

    it('selects no user-identifying column (EF-11, ENF-05)', async () => {
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());
      const qb = stubCheckinQb([{ teamName: 'France', count: 5 }]);

      const result = await service.getCrowdStatus(FANZONE_ID);

      const sql = sqlOf(qb);
      expect(sql).not.toContain('userId');
      expect(sql).not.toContain('user_id');
      expect(sql).not.toContain('sessionToken');
      expect(JSON.stringify(result)).not.toContain('user');
    });

    it('returns an empty breakdown when nobody is checked in', async () => {
      fanzoneRepo.findOne.mockResolvedValue(
        makeFanzone({ capacity: 5000, availableSpots: 5000 }),
      );
      stubCheckinQb([]);

      const result = await service.getCrowdStatus(FANZONE_ID);

      expect(result).toEqual({
        totalPresent: 0,
        byTeam: [],
        occupancyPercentage: 0,
      });
    });

    it('reports 0 occupancy for a zero-capacity fan zone rather than dividing by zero', async () => {
      fanzoneRepo.findOne.mockResolvedValue(
        makeFanzone({ capacity: 0, availableSpots: 0 }),
      );
      stubCheckinQb([]);

      const { occupancyPercentage } = await service.getCrowdStatus(FANZONE_ID);

      expect(occupancyPercentage).toBe(0);
    });

    it('clamps occupancy to 100 when availableSpots is inconsistent', async () => {
      fanzoneRepo.findOne.mockResolvedValue(
        makeFanzone({ capacity: 100, availableSpots: -50 }),
      );
      stubCheckinQb([]);

      const { occupancyPercentage } = await service.getCrowdStatus(FANZONE_ID);

      expect(occupancyPercentage).toBe(100);
    });
  });
});
