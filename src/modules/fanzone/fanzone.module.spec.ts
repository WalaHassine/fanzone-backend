import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';

import { FanzoneModule } from './fanzone.module';
import { FanzoneService } from './fanzone.service';
import { FanzoneController } from './fanzone.controller';
import { FanzoneEntity } from './entities/fanzone.entity';
import { CheckinService } from '../checkin/checkin.service';
import { CheckinEntity } from '../checkin/entities/checkin.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { MatchEntity } from '../match/entities/match.entity';
import { UserEntity } from '../user/entities/user.entity';
import { UserPreferenceEntity } from '../user/entities/user-preference.entity';

/**
 * Integration test for FanzoneModule wiring (Task 5.4).
 *
 * Compiles the real FanzoneModule through Nest's DI container with the database
 * stubbed, so it exercises the actual graph without needing Postgres. A
 * circular dependency or an unresolved provider would make `.compile()` throw,
 * failing the suite — which is what makes this the CI-visible proof of the
 * acceptance criteria ("loads without circular dependency errors", "no undefined
 * service injection") rather than something only a manual boot can show.
 *
 * FanzoneModule and CheckinModule import each other, each wrapping the peer in
 * `forwardRef`. Compiling from this side pulls in that whole cycle plus
 * CheckinModule's own UserModule -> MatchModule chain, hence six stubbed
 * repositories. No JWT namespace is needed: the controller's JwtAuthGuard and
 * RolesGuard only inject `Reflector`, which @nestjs/core always provides.
 */
describe('FanzoneModule (ENF-08)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // Precautionary: any transitive ConfigService injection resolves.
        ConfigModule.forRoot({ isGlobal: true }),
        FanzoneModule,
      ],
    })
      // forFeature repositories across FanzoneModule and everything it reaches
      // (CheckinModule -> UserModule -> MatchModule) — stubbed so no DataSource
      // or live DB is required to build the container.
      .overrideProvider(getRepositoryToken(FanzoneEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(TeamEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(CheckinEntity))
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
    // Reaching this point means .compile() resolved the whole graph, including
    // the FanzoneModule <-> CheckinModule forwardRef cycle.
    expect(moduleRef).toBeDefined();
  });

  it('registers FanzoneService as an injectable provider', () => {
    expect(moduleRef.get(FanzoneService)).toBeInstanceOf(FanzoneService);
  });

  it('injects FanzoneService into FanzoneController', () => {
    const controller = moduleRef.get(FanzoneController);
    expect(controller).toBeInstanceOf(FanzoneController);
    // The controller cannot construct without its FanzoneService dependency.
    expect(controller['fanzoneService']).toBeInstanceOf(FanzoneService);
  });

  it('wires all three repositories into FanzoneService', () => {
    const service = moduleRef.get(FanzoneService);
    expect(service['fanzoneRepository']).toBeDefined();
    // Teams validate `teamIds`; check-ins back the crowd aggregation. Both are
    // registered by FanzoneModule's own forFeature rather than borrowed from
    // another module's exports, which is what keeps them out of the cycle.
    expect(service['teamRepository']).toBeDefined();
    expect(service['checkinRepository']).toBeDefined();
  });

  it('resolves CheckinService across the forwardRef cycle', () => {
    // Proves the FanzoneModule -> CheckinModule half of the cycle is traversable
    // and that CheckinModule's own providers are constructible from here.
    expect(moduleRef.get(CheckinService)).toBeInstanceOf(CheckinService);
  });

  it('exports FanzoneService and the entity repositories for other modules', () => {
    // RecommendationModule, AdminModule and CheckinModule all rely on these.
    expect(moduleRef.get(FanzoneService)).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(FanzoneEntity))).toBeDefined();
  });
});
