import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

const USER_ID = 'user-uuid-a';
const FANZONE_ID = 'fanzone-uuid-a';
const TEAM_ID = 'team-uuid-a';
const OTHER_TEAM_ID = 'team-uuid-b';
const CREATED_AT = new Date('2026-07-27T18:30:00.000Z');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<Repository<T>, 'findOne'>
>;

/** The subset of EntityManager the transactional block uses. */
type ManagerMock = jest.Mocked<
  Pick<EntityManager, 'create' | 'save' | 'update'>
>;

describe('CheckinService', () => {
  let service: CheckinService;
  let checkinRepo: RepoMock<CheckinEntity> & {
    manager: { transaction: jest.Mock };
  };
  let fanzoneRepo: RepoMock<FanzoneEntity>;
  let teamRepo: RepoMock<TeamEntity>;
  let manager: ManagerMock;

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
    } as unknown as ManagerMock;

    checkinRepo = {
      findOne: jest.fn(),
      // Runs the callback inline against the stub manager, so the assertions
      // below see exactly what the transactional block did.
      manager: {
        transaction: jest.fn((cb: (m: ManagerMock) => unknown) => cb(manager)),
      },
    };

    fanzoneRepo = { findOne: jest.fn() };
    teamRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: getRepositoryToken(CheckinEntity), useValue: checkinRepo },
        { provide: getRepositoryToken(FanzoneEntity), useValue: fanzoneRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
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
});
