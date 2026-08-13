import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThanOrEqual, QueryFailedError, Repository } from 'typeorm';

import { AlertService } from './alert.service';
import { AlertEntity, AlertStatus } from './entities/alert.entity';
import { UserEntity } from '../user/entities/user.entity';
import { MatchEntity } from '../match/entities/match.entity';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const OTHER_USER_ID = 'b2c3d4e5-6f70-4819-a2b3-c4d5e6f70819';
const MATCH_ID = '7d3f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
const ALERT_ID = '5f6a7b8c-9d0e-41f2-a3b4-c5d6e7f8a9b0';
const HOME_TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const AWAY_TEAM_ID = '4a1d0c8f-2b3c-4d5e-af90-1b2c3d4e5f60';
const STRANGER_TEAM_ID = '6c3f2e1d-8a9b-4c0d-be1f-2a3b4c5d6e7f';

/** The clock every case below is written against. */
const NOW = new Date('2026-06-15T12:00:00.000Z');
const KICK_OFF = new Date('2026-06-15T18:00:00.000Z');
const TRIGGER_TIME = new Date('2026-06-15T17:00:00.000Z');

const BATCH_SIZE = 100;

/**
 * `@nestjs/schedule`'s own key for a job's name.
 *
 * Written out rather than imported: the package exports it only from
 * `dist/schedule.constants`, and reaching past a package's entry point is the
 * kind of import that breaks on a patch release.
 */
const SCHEDULER_NAME = 'SCHEDULER_NAME';

type AlertRepoMock = jest.Mocked<
  Pick<
    Repository<AlertEntity>,
    'findOne' | 'find' | 'create' | 'save' | 'update' | 'delete'
  >
>;
type ReadRepoMock<T extends object> = jest.Mocked<
  Pick<Repository<T>, 'findOne'>
>;

function makeTeam(id: string, name: string) {
  return { id, name };
}

/** A fan following the home team, unless overridden. */
function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: 'fan1@test.local',
    favoriteTeams: [makeTeam(HOME_TEAM_ID, 'Tunisia')],
    ...overrides,
  } as unknown as UserEntity;
}

function makeMatch(overrides: Partial<MatchEntity> = {}): MatchEntity {
  return {
    id: MATCH_ID,
    matchDate: KICK_OFF,
    homeTeam: makeTeam(HOME_TEAM_ID, 'Tunisia'),
    awayTeam: makeTeam(AWAY_TEAM_ID, 'France'),
    ...overrides,
  } as unknown as MatchEntity;
}

function makeAlert(overrides: Partial<AlertEntity> = {}): AlertEntity {
  return {
    id: ALERT_ID,
    userId: USER_ID,
    matchId: MATCH_ID,
    triggerTime: TRIGGER_TIME,
    status: AlertStatus.PENDING,
    customMessage: null,
    sentAt: null,
    createdAt: NOW,
    ...overrides,
  } as unknown as AlertEntity;
}

/** A TypeORM-wrapped Postgres error, as `save` would reject with. */
function uniqueViolation(): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key value'), {
    code: '23505',
  });
  return new QueryFailedError('INSERT', [], driverError);
}

describe('AlertService', () => {
  let service: AlertService;
  let alertRepo: AlertRepoMock;
  let userRepo: ReadRepoMock<UserEntity>;
  let matchRepo: ReadRepoMock<MatchEntity>;

  async function build(
    scheduleConfig = {
      alertSweepEnabled: true,
      alertSweepBatchSize: BATCH_SIZE,
    },
  ): Promise<void> {
    alertRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      // Mirrors TypeORM: `create` hydrates, `save` persists.
      create: jest.fn((plain: object) => plain),
      save: jest.fn((entity: object) =>
        Promise.resolve({ ...entity, id: ALERT_ID, createdAt: NOW }),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as AlertRepoMock;

    userRepo = { findOne: jest.fn().mockResolvedValue(makeUser()) };
    matchRepo = { findOne: jest.fn().mockResolvedValue(makeMatch()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        { provide: getRepositoryToken(AlertEntity), useValue: alertRepo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(MatchEntity), useValue: matchRepo },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(scheduleConfig) },
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
  }

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    await build();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('createAlert (EF-16)', () => {
    const create = () =>
      service.createAlert(USER_ID, MATCH_ID, TRIGGER_TIME.toISOString());

    it('saves a PENDING alert for the caller', async () => {
      await create();

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          matchId: MATCH_ID,
          status: AlertStatus.PENDING,
        }),
      );
      expect(alertRepo.save).toHaveBeenCalled();
    });

    it('stores a custom message when one is given', async () => {
      await service.createAlert(
        USER_ID,
        MATCH_ID,
        TRIGGER_TIME.toISOString(),
        'Meet the lads early',
      );

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ customMessage: 'Meet the lads early' }),
      );
    });

    it('stores null rather than undefined when no message is given', async () => {
      await create();

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ customMessage: null }),
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(create()).rejects.toThrow(NotFoundException);
      // Short-circuits: no point loading a fixture for a user who is not there.
      expect(matchRepo.findOne).not.toHaveBeenCalled();
      expect(alertRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the match does not exist', async () => {
      matchRepo.findOne.mockResolvedValue(null);

      await expect(create()).rejects.toThrow(NotFoundException);
      expect(alertRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the trigger time is after kick-off', async () => {
      await expect(
        service.createAlert(
          USER_ID,
          MATCH_ID,
          new Date(KICK_OFF.getTime() + 60_000).toISOString(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(alertRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the trigger time equals kick-off', async () => {
      // The `>=` boundary: an alert firing at kick-off is already too late.
      await expect(
        service.createAlert(USER_ID, MATCH_ID, KICK_OFF.toISOString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the trigger time is in the past', async () => {
      await expect(
        service.createAlert(
          USER_ID,
          MATCH_ID,
          new Date(NOW.getTime() - 60_000).toISOString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the trigger time equals now', async () => {
      // The `<=` boundary.
      await expect(
        service.createAlert(USER_ID, MATCH_ID, NOW.toISOString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the trigger time is unparseable', async () => {
      await expect(
        service.createAlert(USER_ID, MATCH_ID, 'tomorrow'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a match where the home team is a favourite', async () => {
      await expect(create()).resolves.toBeDefined();
    });

    it('accepts a match where the away team is a favourite', async () => {
      userRepo.findOne.mockResolvedValue(
        makeUser({
          favoriteTeams: [makeTeam(AWAY_TEAM_ID, 'France')],
        } as unknown as Partial<UserEntity>),
      );

      await expect(create()).resolves.toBeDefined();
    });

    it('throws BadRequestException when neither side is a favourite', async () => {
      userRepo.findOne.mockResolvedValue(
        makeUser({
          favoriteTeams: [makeTeam(STRANGER_TEAM_ID, 'Brazil')],
        } as unknown as Partial<UserEntity>),
      );

      await expect(create()).rejects.toThrow(BadRequestException);
      // The favourite gate runs before the duplicate query.
      expect(alertRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the fan follows no teams at all', async () => {
      userRepo.findOne.mockResolvedValue(
        makeUser({ favoriteTeams: undefined } as unknown as Partial<UserEntity>),
      );

      await expect(create()).rejects.toThrow(BadRequestException);
    });

    it('matches favourites by team id, not by name', async () => {
      // Team names carry no unique constraint, so a same-named different team
      // must not open the gate.
      userRepo.findOne.mockResolvedValue(
        makeUser({
          favoriteTeams: [makeTeam(STRANGER_TEAM_ID, 'Tunisia')],
        } as unknown as Partial<UserEntity>),
      );

      await expect(create()).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a PENDING alert already exists', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert());

      await expect(create()).rejects.toThrow(ConflictException);
      expect(alertRepo.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a SENT alert already exists', async () => {
      alertRepo.findOne.mockResolvedValue(
        makeAlert({ status: AlertStatus.SENT }),
      );

      await expect(create()).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when a DISMISSED alert already exists', async () => {
      // The slot stays occupied after a dismissal — deleting is the way to free
      // it. Tested separately from the other two because a `status: PENDING`
      // slip in the duplicate query would still pass the PENDING case.
      alertRepo.findOne.mockResolvedValue(
        makeAlert({ status: AlertStatus.DISMISSED }),
      );

      await expect(create()).rejects.toThrow(ConflictException);
    });

    it('queries for duplicates without filtering on status', async () => {
      await create();

      expect(alertRepo.findOne).toHaveBeenCalledWith({
        where: { userId: USER_ID, matchId: MATCH_ID },
      });
    });

    it('translates a unique-violation from save into ConflictException', async () => {
      // Two simultaneous requests both cleared the pre-check; the index settles it.
      alertRepo.save.mockRejectedValue(uniqueViolation());

      await expect(create()).rejects.toThrow(ConflictException);
    });

    it('rethrows a save failure that is not a unique violation', async () => {
      const failure = new Error('connection terminated');
      alertRepo.save.mockRejectedValue(failure);

      await expect(create()).rejects.toThrow(failure);
    });
  });

  describe('getUserAlerts (EF-16)', () => {
    it('returns only PENDING alerts, soonest first, for that user', async () => {
      await service.getUserAlerts(USER_ID);

      expect(alertRepo.find).toHaveBeenCalledWith({
        where: { userId: USER_ID, status: AlertStatus.PENDING },
        order: { triggerTime: 'ASC' },
      });
    });

    it('returns an empty list when the fan has no active alerts', async () => {
      alertRepo.find.mockResolvedValue([]);

      await expect(service.getUserAlerts(USER_ID)).resolves.toEqual([]);
    });

    it('preserves the order the query returned', async () => {
      const soon = makeAlert({ id: 'alert-a' });
      const later = makeAlert({ id: 'alert-b' });
      alertRepo.find.mockResolvedValue([soon, later]);

      await expect(service.getUserAlerts(USER_ID)).resolves.toEqual([
        soon,
        later,
      ]);
    });
  });

  describe('triggerAlert (EF-16)', () => {
    it('throws NotFoundException when no alert has that id', async () => {
      alertRepo.findOne.mockResolvedValue(null);

      await expect(service.triggerAlert(ALERT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(alertRepo.update).not.toHaveBeenCalled();
    });

    it('does nothing for an alert that was already sent', async () => {
      alertRepo.findOne.mockResolvedValue(
        makeAlert({ status: AlertStatus.SENT }),
      );

      await service.triggerAlert(ALERT_ID);

      expect(alertRepo.update).not.toHaveBeenCalled();
    });

    it('does nothing for a dismissed alert', async () => {
      alertRepo.findOne.mockResolvedValue(
        makeAlert({ status: AlertStatus.DISMISSED }),
      );

      await service.triggerAlert(ALERT_ID);

      expect(alertRepo.update).not.toHaveBeenCalled();
    });

    it('marks the alert SENT with the current time', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert());

      await service.triggerAlert(ALERT_ID);

      expect(alertRepo.update).toHaveBeenCalledWith(
        expect.anything(),
        { status: AlertStatus.SENT, sentAt: NOW },
      );
    });

    it('scopes the update to rows still PENDING', async () => {
      // This condition is the cross-process guarantee: two instances both see a
      // PENDING row, but only one UPDATE matches, so only one of them logs.
      alertRepo.findOne.mockResolvedValue(makeAlert());

      await service.triggerAlert(ALERT_ID);

      expect(alertRepo.update).toHaveBeenCalledWith(
        { id: ALERT_ID, status: AlertStatus.PENDING },
        expect.anything(),
      );
    });

    it('logs once when it wins the update', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert());
      const log = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation(() => undefined);

      await service.triggerAlert(ALERT_ID);

      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toContain(USER_ID);
    });

    it('does not log when another worker won the update', async () => {
      // The log is the MVP's delivery, so a lost race must be silent.
      alertRepo.findOne.mockResolvedValue(makeAlert());
      alertRepo.update.mockResolvedValue({ affected: 0 } as never);
      const log = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation(() => undefined);

      await service.triggerAlert(ALERT_ID);

      expect(log).not.toHaveBeenCalled();
    });

    it('does not log when the driver reports no affected count', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert());
      alertRepo.update.mockResolvedValue({ affected: undefined } as never);
      const log = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation(() => undefined);

      await service.triggerAlert(ALERT_ID);

      expect(log).not.toHaveBeenCalled();
    });
  });

  describe('dismissAlert (EF-16)', () => {
    it('throws NotFoundException when no alert has that id', async () => {
      alertRepo.findOne.mockResolvedValue(null);

      await expect(service.dismissAlert(USER_ID, ALERT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(alertRepo.save).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the alert belongs to another user', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert({ userId: OTHER_USER_ID }));

      await expect(service.dismissAlert(USER_ID, ALERT_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(alertRepo.save).not.toHaveBeenCalled();
    });

    it('sets the status to DISMISSED', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert());

      await service.dismissAlert(USER_ID, ALERT_ID);

      expect(alertRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: AlertStatus.DISMISSED }),
      );
    });

    it('leaves the row in place, so the match stays taken', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert());

      await service.dismissAlert(USER_ID, ALERT_ID);

      expect(alertRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteAlert (EF-16)', () => {
    it('throws NotFoundException when no alert has that id', async () => {
      alertRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteAlert(USER_ID, ALERT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(alertRepo.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the alert belongs to another user', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert({ userId: OTHER_USER_ID }));

      await expect(service.deleteAlert(USER_ID, ALERT_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(alertRepo.delete).not.toHaveBeenCalled();
    });

    it('removes the row, freeing the match for a new alert', async () => {
      alertRepo.findOne.mockResolvedValue(makeAlert());

      await service.deleteAlert(USER_ID, ALERT_ID);

      expect(alertRepo.delete).toHaveBeenCalledWith({ id: ALERT_ID });
    });
  });

  describe('handlePendingAlerts (EF-16)', () => {
    it('queries alerts already due, oldest first, capped at the batch size', async () => {
      await service.handlePendingAlerts();

      expect(alertRepo.find).toHaveBeenCalledWith({
        where: {
          status: AlertStatus.PENDING,
          triggerTime: LessThanOrEqual(NOW),
        },
        order: { triggerTime: 'ASC' },
        take: BATCH_SIZE,
      });
    });

    it('triggers every alert the query returned', async () => {
      alertRepo.find.mockResolvedValue([
        makeAlert({ id: 'alert-a' }),
        makeAlert({ id: 'alert-b' }),
      ]);
      const trigger = jest
        .spyOn(service, 'triggerAlert')
        .mockResolvedValue(undefined);

      await service.handlePendingAlerts();

      expect(trigger).toHaveBeenCalledTimes(2);
      expect(trigger).toHaveBeenCalledWith('alert-a');
      expect(trigger).toHaveBeenCalledWith('alert-b');
    });

    it('logs a failing alert and carries on with the rest', async () => {
      alertRepo.find.mockResolvedValue([
        makeAlert({ id: 'alert-a' }),
        makeAlert({ id: 'alert-b' }),
        makeAlert({ id: 'alert-c' }),
      ]);
      const trigger = jest
        .spyOn(service, 'triggerAlert')
        .mockRejectedValueOnce(new Error('row vanished'))
        .mockResolvedValue(undefined);
      const error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await service.handlePendingAlerts();

      expect(trigger).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][0]).toContain('alert-a');
    });

    it('survives the query itself failing', async () => {
      alertRepo.find.mockRejectedValue(new Error('connection terminated'));
      const error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await expect(service.handlePendingAlerts()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('skips a tick that arrives while the previous sweep is running', async () => {
      let release: (alerts: AlertEntity[]) => void = () => undefined;
      alertRepo.find.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }) as never,
      );
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);

      const first = service.handlePendingAlerts();
      await service.handlePendingAlerts();

      expect(alertRepo.find).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);

      release([]);
      await first;
    });

    it('releases the in-flight flag even when the sweep fails', async () => {
      // Otherwise one bad minute silences every minute after it.
      alertRepo.find.mockRejectedValueOnce(new Error('connection terminated'));
      jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      await service.handlePendingAlerts();
      await service.handlePendingAlerts();

      expect(alertRepo.find).toHaveBeenCalledTimes(2);
    });

    it('does nothing at all when the sweep is disabled', async () => {
      await build({ alertSweepEnabled: false, alertSweepBatchSize: BATCH_SIZE });

      await service.handlePendingAlerts();

      expect(alertRepo.find).not.toHaveBeenCalled();
    });

    it('honours a configured batch size other than the default', async () => {
      await build({ alertSweepEnabled: true, alertSweepBatchSize: 7 });

      await service.handlePendingAlerts();

      expect(alertRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 7 }),
      );
    });

    it('is registered as a named cron job', () => {
      // The scheduler never runs here — this spec builds the service from a bare
      // provider array, so there is no ScheduleModule and @Cron is inert
      // metadata. Reading the metadata is what stops the decorator being dropped
      // without anyone noticing.
      const name: unknown = Reflect.getMetadata(
        SCHEDULER_NAME,
        AlertService.prototype.handlePendingAlerts,
      );

      expect(name).toBe('alert-sweep');
    });
  });
});
