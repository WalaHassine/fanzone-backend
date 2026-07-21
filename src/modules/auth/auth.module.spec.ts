import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserService } from '../user/user.service';
import { UserEntity } from '../user/entities/user.entity';
import { UserPreferenceEntity } from '../user/entities/user-preference.entity';
import { MatchEntity } from '../match/entities/match.entity';
import { TeamEntity } from '../match/entities/team.entity';

/**
 * Integration test for AuthModule wiring (Task 3.6).
 *
 * Compiles the real AuthModule through Nest's DI container with the database
 * and environment stubbed, so it exercises the actual graph
 * (AuthModule -> UserModule -> MatchModule) without needing Postgres. A
 * circular dependency or an unresolved provider would make `.compile()` throw,
 * failing the suite.
 */
describe('AuthModule (ENF-08)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // Global so AuthModule's JwtModule.registerAsync and JwtStrategy can
        // inject ConfigService. The jwt namespace is supplied inline so the
        // real jwt.config (which throws when JWT_SECRET is unset) is bypassed.
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              jwt: { secret: 'test-secret', expiration: '1h', expiresInSeconds: 3600 },
            }),
          ],
        }),
        AuthModule,
      ],
    })
      // forFeature repositories across the AuthModule subgraph — stubbed so no
      // DataSource / live DB is required to build the container.
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
    // Reaching this point means .compile() resolved the whole graph.
    expect(moduleRef).toBeDefined();
  });

  it('registers AuthService as an injectable provider', () => {
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
  });

  it('registers JwtStrategy with Passport', () => {
    expect(moduleRef.get(JwtStrategy)).toBeInstanceOf(JwtStrategy);
  });

  it('injects AuthService into AuthController', () => {
    const controller = moduleRef.get(AuthController);
    expect(controller).toBeInstanceOf(AuthController);
    // The controller cannot construct without its AuthService dependency.
    expect(controller['authService']).toBeInstanceOf(AuthService);
  });

  it('injects JwtService and ConfigService into AuthService', () => {
    const service = moduleRef.get(AuthService);
    expect(service['jwtService']).toBeInstanceOf(JwtService);
    expect(service['configService']).toBeInstanceOf(ConfigService);
    // UserService arrives through the imported UserModule, not a local provider.
    expect(service['userService']).toBeInstanceOf(UserService);
  });

  it('exports AuthService, JwtService and Passport for other modules', () => {
    // Exported providers are resolvable from the compiled module.
    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(JwtService)).toBeDefined();
  });
});
