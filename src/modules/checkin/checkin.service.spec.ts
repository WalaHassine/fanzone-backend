import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  EntityManager,
  FindOperator,
  ObjectLiteral,
  Repository,
} from 'typeorm';

import { CheckinService } from './checkin.service';
import { CheckinEntity } from './entities/checkin.entity';
import { FanzoneEntity } from '../fanzone/entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { FanzoneService } from '../fanzone/fanzone.service';
import { CrowdStatusDto } from '../fanzone/dto';

const USER_ID = 'user-uuid-a';
const OTHER_USER_ID = 'user-uuid-b';
const FANZONE_ID = 'fanzone-uuid-a';
const OTHER_FANZONE_ID = 'fanzone-uuid-b';
const TEAM_ID = 'team-uuid-a';
const OTHER_TEAM_ID = 'team-uuid-b';
const CHECKIN_ID = 'checkin-uuid-a';
const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const CREATED_AT = new Date('2026-07-27T18:30:00.000Z');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<Repository<T>, 'findOne'>
>;

/** The subset of EntityManager the transactional blocks use. */
type ManagerMock = jest.Mocked<
  Pick<EntityManager, 'create' | 'save' | 'update' | 'delete' | 'findOne'>
>;

/**
 * The chainable subset of SelectQueryBuilder the read paths drive. Every builder
 * call returns the same object, so the assertions can read the arguments back
 * off it.
 *
 * `andWhere` is stubbed although nothing calls it: that is what lets
 * `getCheckInBySessionToken` assert it is *not* window-bounded.
 */
type QueryBuilderMock = {
  innerJoin: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getMany: jest.Mock;
  getOne: jest.Mock;
};

describe('CheckinService', () => {
  let service: CheckinService;
  let checkinRepo: RepoMock<CheckinEntity> & {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let fanzoneRepo: RepoMock<FanzoneEntity>;
  let teamRepo: RepoMock<TeamEntity>;
  let fanzoneService: jest.Mocked<Pick<FanzoneService, 'getCrowdStatus'>>;
  let manager: ManagerMock;
  let queryBuilder: QueryBuilderMock;

  function makeTeam(overrides: Partial<TeamEntity> = {}): TeamEntity {
    return {
      id: TEAM_ID,
      name: 'Tunisia',
      code: 'TUN',
      flag: null,
      createdAt: CREATED_AT,
      ...overrides,
    } as unknown as TeamEntity;
  }

  function makeFanzone(overrides: Partial<FanzoneEntity> = {}): FanzoneEntity {
    return {
      id: FANZONE_ID,
      name: 'Tunis Stadium',
      capacity: 100,
      availableSpots: 100,
      teams: [makeTeam()],
      ...overrides,
    } as FanzoneEntity;
  }

  /** A stored check-in as `checkout` loads it: three columns, no relations. */
  function makeCheckin(overrides: Partial<CheckinEntity> = {}): CheckinEntity {
    return {
      id: CHECKIN_ID,
      userId: USER_ID,
      fanzoneId: FANZONE_ID,
      ...overrides,
    } as CheckinEntity;
  }

  /**
   * A check-in as the QueryBuilder read paths return one: the four check-in
   * columns plus partially hydrated `fanzone` and `team`, and **no `userId`** —
   * that column is not in the select list, so it is not on the row either.
   */
  function makeHydratedCheckin(
    overrides: Partial<CheckinEntity> = {},
  ): CheckinEntity {
    return {
      id: CHECKIN_ID,
      sessionToken: SESSION_TOKEN,
      fanzoneId: FANZONE_ID,
      createdAt: CREATED_AT,
      fanzone: {
        id: FANZONE_ID,
        name: 'Tunis Stadium',
        city: 'Tunis',
        address: '123 Main St',
      },
      team: { id: TEAM_ID, name: 'Tunisia' },
      ...overrides,
    } as unknown as CheckinEntity;
  }

  const dto = { fanzoneId: FANZONE_ID, teamId: TEAM_ID };

  /** Seeds the happy path: zone exists, team exists and broadcasts, no duplicate. */
  function seedValid(fanzone: FanzoneEntity = makeFanzone()): FanzoneEntity {
    fanzoneRepo.findOne.mockResolvedValue(fanzone);
    teamRepo.findOne.mockResolvedValue(makeTeam());
    checkinRepo.findOne.mockResolvedValue(null);
    return fanzone;
  }

  beforeEach(async () => {
    manager = {
      // Mirrors TypeORM: `create` returns the hydrated entity, `save` persists it.
      create: jest.fn((_entity, plain: object) => plain),
      save: jest.fn((entity: object) =>
        Promise.resolve({
          ...entity,
          id: 'checkin-uuid-a',
          createdAt: CREATED_AT,
        }),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      // `checkout` re-reads the fan zone inside the transaction for its
      // capacity and current spot count.
      findOne: jest.fn().mockResolvedValue(makeFanzone()),
    } as unknown as ManagerMock;

    queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(makeHydratedCheckin()),
    };

    checkinRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
      // Runs the callback inline against the stub manager, so the assertions
      // below see exactly what the transactional block did.
      manager: {
        transaction: jest.fn((cb: (m: ManagerMock) => unknown) => cb(manager)),
      },
    };

    fanzoneRepo = { findOne: jest.fn() };
    teamRepo = { findOne: jest.fn() };
    fanzoneService = { getCrowdStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: getRepositoryToken(CheckinEntity), useValue: checkinRepo },
        { provide: getRepositoryToken(FanzoneEntity), useValue: fanzoneRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
        { provide: FanzoneService, useValue: fanzoneService },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create (EF-10)', () => {
    it('saves the check-in with the id from the token, not from the body', async () => {
      seedValid();

      const result = await service.create(USER_ID, dto);

      expect(manager.create).toHaveBeenCalledWith(
        CheckinEntity,
        expect.objectContaining({
          userId: USER_ID,
          fanzoneId: FANZONE_ID,
          teamId: TEAM_ID,
        }),
      );
      expect(result.userId).toBe(USER_ID);
    });

    it('returns the entity with its team and fan zone attached', async () => {
      const fanzone = seedValid();

      const result = await service.create(USER_ID, dto);

      // `save` hydrates no relations, so the controller could not read
      // `team.name` for the response without this. No extra query is involved —
      // both entities were already loaded for the validation above.
      expect(result.team).toEqual(makeTeam());
      expect(result.team.name).toBe('Tunisia');
      expect(result.fanzone).toBe(fanzone);
    });

    it('generates the sessionToken server-side', async () => {
      seedValid();

      const result = await service.create(USER_ID, dto);

      // The DTO has no sessionToken field; the value must come from randomUUID.
      expect(result.sessionToken).toMatch(UUID_PATTERN);
    });

    it('gives two check-ins different session tokens', async () => {
      seedValid();
      const first = await service.create(USER_ID, dto);
      seedValid();
      const second = await service.create('user-uuid-b', dto);

      expect(first.sessionToken).not.toBe(second.sessionToken);
    });

    it('decrements availableSpots by exactly one', async () => {
      seedValid(makeFanzone({ capacity: 100, availableSpots: 70 }));

      await service.create(USER_ID, dto);

      expect(manager.update).toHaveBeenCalledWith(FanzoneEntity, FANZONE_ID, {
        availableSpots: 69,
      });
    });

    it('takes the last spot down to 0, never below', async () => {
      // The reachable floor: anything at or below 0 is rejected as full first,
      // so 1 -> 0 is the lowest the decrement can ever produce.
      seedValid(makeFanzone({ capacity: 100, availableSpots: 1 }));

      await service.create(USER_ID, dto);

      expect(manager.update).toHaveBeenCalledWith(FanzoneEntity, FANZONE_ID, {
        availableSpots: 0,
      });
    });

    it('writes the row and the decrement inside one transaction', async () => {
      seedValid();

      await service.create(USER_ID, dto);

      // Both writes went through the transactional manager, never the repository.
      expect(checkinRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.update).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the fan zone does not exist', async () => {
      fanzoneRepo.findOne.mockResolvedValue(null);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the team does not exist', async () => {
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());
      teamRepo.findOne.mockResolvedValue(null);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects a team that is not broadcast at the fan zone', async () => {
      // The zone shows Tunisia; the caller supports a team it does not broadcast.
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());
      teamRepo.findOne.mockResolvedValue(
        makeTeam({ id: OTHER_TEAM_ID, name: 'Brazil', code: 'BRA' }),
      );
      checkinRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { ...dto, teamId: OTHER_TEAM_ID }),
      ).rejects.toThrow(BadRequestException);
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects a check-in when the fan zone is full', async () => {
      seedValid(makeFanzone({ capacity: 100, availableSpots: 0 }));

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects a repeat check-in by the same user at the same fan zone', async () => {
      fanzoneRepo.findOne.mockResolvedValue(makeFanzone());
      teamRepo.findOne.mockResolvedValue(makeTeam());
      checkinRepo.findOne.mockResolvedValue({
        id: 'checkin-uuid-existing',
      } as CheckinEntity);

      await expect(service.create(USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      // Without this guard one account could inflate a crowd count arbitrarily.
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('bounds the duplicate check to the shared presence window', async () => {
      seedValid();
      const now = new Date('2026-07-27T20:00:00.000Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

      await service.create(USER_ID, dto);

      const where = checkinRepo.findOne.mock.calls[0][0]?.where as {
        userId: string;
        fanzoneId: string;
        createdAt: FindOperator<Date>;
      };
      expect(where.userId).toBe(USER_ID);
      expect(where.fanzoneId).toBe(FANZONE_ID);
      // CROWD_PRESENCE_WINDOW_HOURS is 4 — the same window the aggregation reads.
      expect(where.createdAt.value).toEqual(
        new Date('2026-07-27T16:00:00.000Z'),
      );
    });
  });

  describe('validateTeamAtFanzone (EF-10)', () => {
    it('accepts a team the fan zone broadcasts', () => {
      expect(service['validateTeamAtFanzone'](makeFanzone(), TEAM_ID)).toBe(
        true,
      );
    });

    it('rejects a team the fan zone does not broadcast', () => {
      expect(
        service['validateTeamAtFanzone'](makeFanzone(), OTHER_TEAM_ID),
      ).toBe(false);
    });

    it('rejects rather than throwing when the fan zone has no teams loaded', () => {
      // A fan zone read with eager relations suppressed has no `teams` at all.
      expect(
        service['validateTeamAtFanzone'](
          { teams: undefined } as unknown as FanzoneEntity,
          TEAM_ID,
        ),
      ).toBe(false);
    });

    it('adds no query — the caller already holds the fan zone', () => {
      service['validateTeamAtFanzone'](makeFanzone(), TEAM_ID);

      expect(fanzoneRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('checkout (EF-10)', () => {
    it('throws NotFoundException when no check-in has that token', async () => {
      checkinRepo.findOne.mockResolvedValue(null);

      await expect(
        service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID),
      ).rejects.toThrow(NotFoundException);
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the check-in belongs to another user', async () => {
      checkinRepo.findOne.mockResolvedValue(
        makeCheckin({ userId: OTHER_USER_ID }),
      );

      await expect(
        service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID),
      ).rejects.toThrow(ForbiddenException);
      // Nothing was removed and no spot was released on somebody else's behalf.
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the check-in is for a different fan zone', async () => {
      checkinRepo.findOne.mockResolvedValue(makeCheckin());

      // The guard that stops a stale token freeing a spot at the wrong venue.
      await expect(
        service.checkout(USER_ID, SESSION_TOKEN, OTHER_FANZONE_ID),
      ).rejects.toThrow(BadRequestException);
      expect(checkinRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('accepts an uppercase fanzoneId against the lowercase stored value', async () => {
      // `@IsUUID('all')` accepts either case and Postgres stores lowercase, so a
      // literal comparison would reject a valid checkout and lock the spot.
      checkinRepo.findOne.mockResolvedValue(
        makeCheckin({ fanzoneId: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f' }),
      );

      await expect(
        service.checkout(
          USER_ID,
          SESSION_TOKEN,
          'C1D2E3F4-5A6B-4C7D-8E9F-0A1B2C3D4E5F',
        ),
      ).resolves.toBeUndefined();
      expect(manager.delete).toHaveBeenCalledTimes(1);
    });

    it('removes the row and releases the spot inside one transaction', async () => {
      checkinRepo.findOne.mockResolvedValue(makeCheckin());

      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);

      expect(checkinRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(CheckinEntity, {
        id: CHECKIN_ID,
      });
      expect(manager.update).toHaveBeenCalledTimes(1);
    });

    it('increments availableSpots by exactly one', async () => {
      checkinRepo.findOne.mockResolvedValue(makeCheckin());
      manager.findOne.mockResolvedValue(
        makeFanzone({ capacity: 100, availableSpots: 70 }),
      );

      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);

      expect(manager.update).toHaveBeenCalledWith(FanzoneEntity, FANZONE_ID, {
        availableSpots: 71,
      });
    });

    it('never releases a spot above capacity', async () => {
      // Reachable when an admin raises availableSpots between the check-in and
      // the checkout: without the cap this would store capacity + 1, which
      // `occupancyPercentage` hides while the zone starts over-admitting fans.
      checkinRepo.findOne.mockResolvedValue(makeCheckin());
      manager.findOne.mockResolvedValue(
        makeFanzone({ capacity: 100, availableSpots: 100 }),
      );

      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);

      expect(manager.update).toHaveBeenCalledWith(FanzoneEntity, FANZONE_ID, {
        availableSpots: 100,
      });
    });

    it('skips the release when the delete removed nothing', async () => {
      // A concurrent checkout of the same token already gave the spot back;
      // incrementing again would free two spots for one check-in.
      checkinRepo.findOne.mockResolvedValue(makeCheckin());
      manager.delete.mockResolvedValue({ affected: 0, raw: [] });

      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);

      expect(manager.update).not.toHaveBeenCalled();
    });

    it('releases the spot at the stored fan zone, not the one supplied', async () => {
      checkinRepo.findOne.mockResolvedValue(makeCheckin());

      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID.toUpperCase());

      const options = manager.findOne.mock.calls[0][1] as {
        where: { id: string };
      };
      expect(options.where.id).toBe(FANZONE_ID);
    });

    it('loads only the columns it validates, with eager relations off', async () => {
      checkinRepo.findOne.mockResolvedValue(makeCheckin());

      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);

      // A plain findOne would hydrate the eager fanzone, its eager teams and the
      // team, for three values this method never reads.
      const options = checkinRepo.findOne.mock.calls[0][0];
      expect(options?.select).toEqual({
        id: true,
        userId: true,
        fanzoneId: true,
      });
      expect(options?.loadEagerRelations).toBe(false);
    });

    it('checks out a stale check-in — the lookup is not window-bounded', async () => {
      checkinRepo.findOne.mockResolvedValue(makeCheckin());

      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);

      // A row past the presence window is out of the crowd count but still holds
      // its spot, and nothing else ever gives it back.
      const where = checkinRepo.findOne.mock.calls[0][0]?.where as {
        sessionToken: string;
        createdAt?: unknown;
      };
      expect(where.sessionToken).toBe(SESSION_TOKEN);
      expect(where.createdAt).toBeUndefined();
    });
  });

  describe('capacity over a sequence (EF-12)', () => {
    const CAPACITY = 50;
    let fanzone: FanzoneEntity;

    /**
     * A **stateful** fan zone, unlike the shared `beforeEach` mock: `update`
     * writes the new spot count back onto the fixture, so each call sees what
     * the previous one left. Every other spot test in this file is single-step
     * from a hand-seeded value, which cannot catch an error that only shows up
     * once the deltas accumulate.
     */
    beforeEach(() => {
      fanzone = makeFanzone({
        capacity: CAPACITY,
        availableSpots: CAPACITY,
      });
      fanzoneRepo.findOne.mockResolvedValue(fanzone);
      teamRepo.findOne.mockResolvedValue(makeTeam());
      manager.findOne.mockResolvedValue(fanzone);
      (manager.update as jest.Mock).mockImplementation(
        (_entity: unknown, _id: string, partial: Partial<FanzoneEntity>) => {
          Object.assign(fanzone, partial);
          return Promise.resolve({ affected: 1 });
        },
      );
    });

    /** Checks a distinct fan in, so the duplicate guard never fires. */
    async function checkInOnce(index: number): Promise<void> {
      checkinRepo.findOne.mockResolvedValue(null);
      await service.create(`user-uuid-${index}`, dto);
    }

    it('starts with every spot free', () => {
      expect(fanzone.capacity).toBe(50);
      expect(fanzone.availableSpots).toBe(50);
    });

    it('leaves 40 spots after ten check-ins', async () => {
      for (let i = 0; i < 10; i++) {
        await checkInOnce(i);
      }

      expect(fanzone.availableSpots).toBe(40);
    });

    it('gives five back on checkout, up to 45', async () => {
      for (let i = 0; i < 10; i++) {
        await checkInOnce(i);
      }

      checkinRepo.findOne.mockResolvedValue(makeCheckin());
      for (let i = 0; i < 5; i++) {
        await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);
      }

      expect(fanzone.availableSpots).toBe(45);
    });

    it('never lets availableSpots go negative', async () => {
      // Drain the zone, then try once more. The full-check has to refuse before
      // the decrement, or occupancy stops describing the venue.
      for (let i = 0; i < CAPACITY; i++) {
        await checkInOnce(i);
      }
      expect(fanzone.availableSpots).toBe(0);

      checkinRepo.findOne.mockResolvedValue(null);
      await expect(service.create('one-too-many', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(fanzone.availableSpots).toBe(0);
    });

    it('never releases a spot above capacity', async () => {
      // One check-in, two checkouts. The second must not push the zone above
      // the 50 spots it actually has.
      await checkInOnce(0);
      checkinRepo.findOne.mockResolvedValue(makeCheckin());
      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);
      await service.checkout(USER_ID, SESSION_TOKEN, FANZONE_ID);

      expect(fanzone.availableSpots).toBe(CAPACITY);
    });
  });

  describe('getCheckInBySessionToken (EF-10, ENF-05)', () => {
    it('looks the check-in up by its session token', async () => {
      await service.getCheckInBySessionToken(SESSION_TOKEN);

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'checkin.sessionToken = :sessionToken',
        { sessionToken: SESSION_TOKEN },
      );
    });

    it('throws NotFoundException when no check-in has that token', async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.getCheckInBySessionToken(SESSION_TOKEN),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses the same not-found message as checkout', async () => {
      // An unknown token and a checked-out one must be indistinguishable —
      // checkout deletes the row, so that is already true and should stay true.
      queryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.getCheckInBySessionToken(SESSION_TOKEN),
      ).rejects.toThrow('Check-in not found');
    });

    it('returns the row with the fan zone and team hydrated', async () => {
      const result = await service.getCheckInBySessionToken(SESSION_TOKEN);

      expect(result.sessionToken).toBe(SESSION_TOKEN);
      expect(result.fanzone).toEqual(
        expect.objectContaining({
          name: 'Tunis Stadium',
          city: 'Tunis',
          address: '123 Main St',
        }),
      );
      expect(result.team.name).toBe('Tunisia');

      // The mapper reads exactly these columns, so they have to be selected.
      // `jest.Mock` is untyped, so the recorded arguments come back as `any`.
      const selected = [
        ...(queryBuilder.select.mock.calls.flat(2) as string[]),
        ...(queryBuilder.addSelect.mock.calls.flat(2) as string[]),
      ];
      expect(selected).toEqual(
        expect.arrayContaining([
          'checkin.sessionToken',
          'checkin.fanzoneId',
          'checkin.createdAt',
          'fanzone.name',
          'fanzone.city',
          'fanzone.address',
          'team.name',
        ]),
      );
    });

    it('never selects a user column (ENF-05)', async () => {
      await service.getCheckInBySessionToken(SESSION_TOKEN);

      // `jest.Mock` is untyped, so the recorded arguments come back as `any`.
      const selected = [
        ...(queryBuilder.select.mock.calls.flat(2) as string[]),
        ...(queryBuilder.addSelect.mock.calls.flat(2) as string[]),
      ];
      expect(selected).not.toContain('checkin.userId');
      expect(queryBuilder.innerJoin).not.toHaveBeenCalledWith(
        'checkin.user',
        expect.anything(),
      );
    });

    it('joins explicitly instead of using find or findOne', async () => {
      await service.getCheckInBySessionToken(SESSION_TOKEN);

      // Leak-by-default is the argument, not cost: `findOne` honours eager
      // relations, so it would hydrate the venue's capacity, spots and PostGIS
      // location onto an entity a *public* handler then maps.
      expect(checkinRepo.find).not.toHaveBeenCalled();
      expect(checkinRepo.findOne).not.toHaveBeenCalled();
      expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
        'checkin.fanzone',
        'fanzone',
      );
      expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
        'checkin.team',
        'team',
      );
    });

    it('reads a check-in past the presence window', async () => {
      await service.getCheckInBySessionToken(SESSION_TOKEN);

      // A stale check-in is out of the crowd count but still a real record
      // holding a spot — the token has to keep resolving it.
      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('getUserCheckIns (EF-10, ENF-05)', () => {
    it('returns only the check-ins of the id it was given', async () => {
      await service.getUserCheckIns(USER_ID);

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'checkin.userId = :userId',
        { userId: USER_ID },
      );
    });

    it('orders newest first, with a stable tiebreak', async () => {
      await service.getUserCheckIns(USER_ID);

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'checkin.createdAt',
        'DESC',
      );
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
        'checkin.id',
        'DESC',
      );
    });

    it('joins the fan zone and the team explicitly instead of using find', async () => {
      await service.getUserCheckIns(USER_ID);

      // `find` honours eager relations, and checkin -> fanzone -> teams is a
      // chain of them ending in a many-to-many: it would multiply rows by each
      // zone's broadcast-team count and load the PostGIS column besides.
      expect(checkinRepo.find).not.toHaveBeenCalled();
      expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
        'checkin.fanzone',
        'fanzone',
      );
      expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
        'checkin.team',
        'team',
      );
    });

    it('returns an empty array for a fan who has never checked in', async () => {
      queryBuilder.getMany.mockResolvedValue([]);

      await expect(service.getUserCheckIns(USER_ID)).resolves.toEqual([]);
    });
  });

  describe('getCrowdStatus (EF-11, EF-12)', () => {
    const snapshot: CrowdStatusDto = {
      totalPresent: 5,
      byTeam: [
        { teamName: 'Tunisia', count: 3, percentage: 60 },
        { teamName: 'France', count: 2, percentage: 40 },
      ],
      occupancyPercentage: 5,
    };

    it('delegates the aggregation instead of running its own', async () => {
      fanzoneService.getCrowdStatus.mockResolvedValue(snapshot);

      await service.getCrowdStatus(FANZONE_ID);

      // One owner for the presence window, the percentage rule and the occupancy
      // source, so this module's figures cannot drift from the fan zone module's.
      expect(fanzoneService.getCrowdStatus).toHaveBeenCalledTimes(1);
      expect(fanzoneService.getCrowdStatus).toHaveBeenCalledWith(FANZONE_ID);
      expect(checkinRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('tags the snapshot with the fan zone and the moment it was computed', async () => {
      fanzoneService.getCrowdStatus.mockResolvedValue(snapshot);
      jest.spyOn(Date, 'now').mockReturnValue(CREATED_AT.getTime());

      const result = await service.getCrowdStatus(FANZONE_ID);

      expect(result).toEqual({
        ...snapshot,
        fanzoneId: FANZONE_ID,
        updatedAt: '2026-07-27T18:30:00.000Z',
      });
    });

    it('exposes no per-person value', async () => {
      fanzoneService.getCrowdStatus.mockResolvedValue(snapshot);

      const result = await service.getCrowdStatus(FANZONE_ID);

      expect(Object.keys(result).sort()).toEqual([
        'byTeam',
        'fanzoneId',
        'occupancyPercentage',
        'totalPresent',
        'updatedAt',
      ]);
    });

    it('propagates NotFoundException for an unknown fan zone', async () => {
      fanzoneService.getCrowdStatus.mockRejectedValue(
        new NotFoundException('Fan zone not found'),
      );

      await expect(service.getCrowdStatus(FANZONE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
