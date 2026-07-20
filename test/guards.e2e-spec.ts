import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Public } from '../src/common/decorators/public.decorator';
import { Roles } from '../src/common/decorators/roles.decorator';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UserRole } from '../src/modules/user/entities/user.entity';

const TEST_SECRET = 'e2e-test-secret';

/**
 * Throwaway controller exercising every guard path. Guards are applied at the
 * class level (as they would be on a real controller); @Public() opts a single
 * route out, and @Roles() tightens another.
 */
@Controller('smoke')
@UseGuards(JwtAuthGuard, RolesGuard)
class SmokeController {
  @Public()
  @Get('public')
  publicRoute() {
    return { route: 'public' };
  }

  @Get('me')
  authenticatedRoute() {
    return { route: 'me' };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin')
  adminRoute() {
    return { route: 'admin' };
  }
}

describe('Guards (e2e)', () => {
  let app: INestApplication;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [SmokeController],
      providers: [
        JwtStrategy,
        // JwtStrategy reads jwt.secret from config; hand it the test secret.
        { provide: ConfigService, useValue: { get: () => TEST_SECRET } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Tokens match the { sub, email, role } payload JwtStrategy expects.
    const jwt = moduleFixture.get(JwtService);
    userToken = jwt.sign({ sub: 'u-1', email: 'fan@worldcup.com', role: UserRole.USER });
    adminToken = jwt.sign({ sub: 'a-1', email: 'admin@worldcup.com', role: UserRole.ADMIN });
  });

  afterAll(async () => {
    await app.close();
  });

  const bearer = (token: string) => `Bearer ${token}`;

  it('allows an unauthenticated request to a @Public() route (200)', () => {
    return request(app.getHttpServer()).get('/smoke/public').expect(200, { route: 'public' });
  });

  it('rejects an unauthenticated request to a protected route (401)', () => {
    return request(app.getHttpServer()).get('/smoke/me').expect(401);
  });

  it('allows an authenticated user on a role-agnostic protected route (200)', () => {
    return request(app.getHttpServer())
      .get('/smoke/me')
      .set('Authorization', bearer(userToken))
      .expect(200, { route: 'me' });
  });

  it('forbids a USER on an ADMIN-only route (403)', () => {
    return request(app.getHttpServer())
      .get('/smoke/admin')
      .set('Authorization', bearer(userToken))
      .expect(403);
  });

  it('allows an ADMIN on an ADMIN-only route (200)', () => {
    return request(app.getHttpServer())
      .get('/smoke/admin')
      .set('Authorization', bearer(adminToken))
      .expect(200, { route: 'admin' });
  });

  it('rejects a token signed with the wrong secret (401)', () => {
    const forged = new JwtService({ secret: 'wrong-secret' }).sign({
      sub: 'x',
      email: 'x@worldcup.com',
      role: UserRole.ADMIN,
    });

    return request(app.getHttpServer())
      .get('/smoke/admin')
      .set('Authorization', bearer(forged))
      .expect(401);
  });
});
