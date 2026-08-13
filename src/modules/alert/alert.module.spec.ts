import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AlertModule } from './alert.module';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { AlertEntity } from './entities/alert.entity';
import scheduleConfig from '../../config/schedule.config';
import { UserEntity } from '../user/entities/user.entity';
import { UserPreferenceEntity } from '../user/entities/user-preference.entity';
import { MatchEntity } from '../match/entities/match.entity';
import { TeamEntity } from '../match/entities/team.entity';

/**
 * Integration test for AlertModule wiring (ENF-08).
 *
 * Compiles the real AlertModule through Nest's DI container with the database
 * stubbed, so an unresolved provider makes `.compile()` throw and fails the
 * suite. Five stubbed repositories cover AlertModule's own forFeature plus what
 * it reaches through UserModule and MatchModule.
 *
 * `scheduleConfig` is loaded for real because `AlertService`'s constructor reads
 * the namespace — that also means this spec would fail on a malformed
 * ALERT_SWEEP_BATCH_SIZE, which is the boot-time behaviour we want.
 */
describe('AlertModule (ENF-08)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [scheduleConfig] }),
        AlertModule,
      ],
    })
      .overrideProvider(getRepositoryToken(AlertEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserPreferenceEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(MatchEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(TeamEntity))
      .useValue({})
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles with no circular-dependency or undefined-injection errors', () => {
    expect(moduleRef).toBeDefined();
  });

  it('registers AlertService as an injectable provider', () => {
    expect(moduleRef.get(AlertService)).toBeInstanceOf(AlertService);
  });

  it('injects AlertService into AlertController', () => {
    const controller = moduleRef.get(AlertController);
    expect(controller).toBeInstanceOf(AlertController);
    expect(controller['alertService']).toBeInstanceOf(AlertService);
  });

  it('wires all three repositories into AlertService', () => {
    // The user and match repositories are borrowed from UserModule's and
    // MatchModule's exported TypeOrmModule rather than re-registered here.
    const service = moduleRef.get(AlertService);
    expect(service['alertRepository']).toBeDefined();
    expect(service['userRepository']).toBeDefined();
    expect(service['matchRepository']).toBeDefined();
  });

  it('reads the sweep configuration once, at construction', () => {
    const service = moduleRef.get(AlertService);
    expect(typeof service['sweepEnabled']).toBe('boolean');
    expect(service['sweepBatchSize']).toBeGreaterThan(0);
  });

  it('exports AlertService and the entity repository for other modules', () => {
    expect(moduleRef.get(AlertService)).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(AlertEntity))).toBeDefined();
  });

  it('does not register the scheduler', () => {
    // ScheduleModule.forRoot() belongs to AppModule alone. Keeping it out of
    // here is what leaves @Cron inert in the specs — no registry, no timers, no
    // sweep firing against a test database. If someone re-adds forRoot to
    // AlertModule, this fails instead of the suite quietly starting a job.
    expect(() => moduleRef.get(SchedulerRegistry)).toThrow();
  });
});
