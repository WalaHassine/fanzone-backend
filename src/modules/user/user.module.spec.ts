import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UserModule } from './user.module';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserEntity } from './entities/user.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { MatchEntity } from '../match/entities/match.entity';

/**
 * Integration test for UserModule wiring.
 *
 * Compiles the real UserModule through Nest's DI container with the database
 * stubbed, so it exercises the actual graph (UserModule -> MatchModule) without
 * needing Postgres. A circular dependency or an unresolved provider would make
 * `.compile()` throw, failing the suite.
 */
describe('UserModule (ENF-08)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // Precautionary: any transitive ConfigService injection resolves.
        ConfigModule.forRoot({ isGlobal: true }),
        UserModule,
      ],
    })
      // forFeature repositories across the UserModule + MatchModule subgraph —
      // stubbed so no DataSource / live DB is required to build the container.
      .overrideProvider(getRepositoryToken(UserEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserPreferenceEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(TeamEntity))
      .useValue({})
      .overrideProvider(getRepositoryToken(MatchEntity))
      .useValue({})
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles with no circular-dependency or undefined-injection errors', () => {
    // Reaching this point means .compile() resolved the whole graph.
    expect(moduleRef).toBeDefined();
  });

  it('registers UserService as an injectable provider', () => {
    expect(moduleRef.get(UserService)).toBeInstanceOf(UserService);
  });

  it('injects UserService into UserController', () => {
    const controller = moduleRef.get(UserController);
    expect(controller).toBeInstanceOf(UserController);
    // The controller cannot construct without its UserService dependency.
    expect(controller['userService']).toBeInstanceOf(UserService);
  });

  it('wires the user, preference and team repositories into UserService', () => {
    const service = moduleRef.get(UserService);
    // The Team repo being present proves the MatchModule import resolved.
    expect(service['userRepository']).toBeDefined();
    expect(service['preferenceRepository']).toBeDefined();
    expect(service['teamRepository']).toBeDefined();
  });

  it('exports UserService and the entity repositories for other modules', () => {
    // Exported providers are resolvable from the compiled module.
    expect(moduleRef.get(UserService)).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(UserEntity))).toBeDefined();
  });
});
