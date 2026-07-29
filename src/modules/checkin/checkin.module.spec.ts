import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CheckinModule } from './checkin.module';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';
import { CheckinEntity } from './entities/checkin.entity';
import { FanzoneService } from '../fanzone/fanzone.service';
import { FanzoneEntity } from '../fanzone/entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { MatchEntity } from '../match/entities/match.entity';
import { UserEntity } from '../user/entities/user.entity';
import { UserPreferenceEntity } from '../user/entities/user-preference.entity';

/**
 * Integration test for CheckinModule wiring (ENF-08).
 *
 * The mirror image of fanzone.module.spec.ts: compiles the real CheckinModule
 * through Nest's DI container with the database stubbed, so the forwardRef cycle
 * with FanzoneModule is exercised from this side too. A circular dependency or
 * an unresolved provider makes `.compile()` throw, failing the suite.
 *
 * Six stubbed repositories cover CheckinModule's own forFeature plus everything
 * it reaches (FanzoneModule, UserModule -> MatchModule).
 */
describe('CheckinModule (ENF-08)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // Precautionary: any transitive ConfigService injection resolves.
        ConfigModule.forRoot({ isGlobal: true }),
        CheckinModule,
      ],
    })
      .overrideProvider(getRepositoryToken(CheckinEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(FanzoneEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(TeamEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserPreferenceEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(MatchEntity))
      .useValue({})
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles with no circular-dependency or undefined-injection errors', () => {
    expect(moduleRef).toBeDefined();
  });

  it('registers CheckinService as an injectable provider', () => {
    expect(moduleRef.get(CheckinService)).toBeInstanceOf(CheckinService);
  });

  it('injects CheckinService into CheckinController', () => {
    const controller = moduleRef.get(CheckinController);
    expect(controller).toBeInstanceOf(CheckinController);
    expect(controller['checkinService']).toBeInstanceOf(CheckinService);
  });

  it('wires all three repositories into CheckinService', () => {
    const service = moduleRef.get(CheckinService);
    // Registered by CheckinModule's own forFeature rather than borrowed from
    // FanzoneModule's exports — which is what keeps them out of the cycle.
    expect(service['checkinRepository']).toBeDefined();
    expect(service['fanzoneRepository']).toBeDefined();
    expect(service['teamRepository']).toBeDefined();
  });

  it('resolves FanzoneService across the forwardRef cycle', () => {
    expect(moduleRef.get(FanzoneService)).toBeInstanceOf(FanzoneService);
  });

  it('exports CheckinService and the entity repositories for other modules', () => {
    // FanzoneModule and AdminModule both rely on these.
    expect(moduleRef.get(CheckinService)).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(CheckinEntity))).toBeDefined();
  });
});
