import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';

import { CheckinController } from '../src/modules/checkin/checkin.controller';
import { UserCheckinsController } from '../src/modules/checkin/user-checkins.controller';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { CheckinEntity } from '../src/modules/checkin/entities/checkin.entity';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UserRole } from '../src/modules/user/entities/user.entity';

const TEST_SECRET = 'e2e-test-secret';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const CREATED_AT = new Date('2026-07-27T18:30:00.000Z');

/**
 * supertest types `Response.body` as `any`. Narrowing it here once keeps the
 * assertions below type-safe without a cast at every call site.
 */
type JsonBody = Record<string, unknown>;
const bodyOf = (res: request.Response): JsonBody => res.body as JsonBody;

type ServiceMock = jest.Mocked<
  Pick<
    CheckinService,
    | 'create'
    | 'checkout'
    | 'getCrowdStatus'
    | 'getCheckInBySessionToken'
    | 'getUserCheckIns'
  >
>;

/**
 * A check-in as the service hands one to a controller: carrying the stored
 * `userId` and an email on the relation, so the leak assertions below have
 * something real to catch.
 */
function makeCheckin(overrides: Partial<CheckinEntity> = {}): CheckinEntity {
  return {
    id: 'checkin-uuid-a',
    userId: USER_ID,
    sessionToken: SESSION_TOKEN,
    fanzoneId: FANZONE_ID,
    teamId: TEAM_ID,
    createdAt: CREATED_AT,
    user: { id: USER_ID, email: 'fan1@test.local' },
    fanzone: {
      id: FANZONE_ID,
      name: 'Tunis Stadium',
      city: 'Tunis',
      address: '123 Main St',
      capacity: 100,
      availableSpots: 95,
    },
    team: { id: TEAM_ID, name: 'Tunisia' },
    ...overrides,
  } as unknown as CheckinEntity;
}

/**
 * Check-in endpoints over real HTTP (EF-10, EF-11, EF-12, ENF-05).
 *
 * The layer the unit specs cannot reach. Everything here is exercised for real —
 * the routes, `JwtAuthGuard`, `ParseUUIDPipe`, the global `ValidationPipe` and
 * the global `HttpExceptionFilter` — so this is the only place that proves a
 * thrown `NotFoundException` actually becomes a 404 on the wire, and that a
 * guarded route actually answers 401 without a token.
 *
 * Modelled on `guards.e2e-spec.ts`, **not** `app.e2e-spec.ts`: the two real
 * controllers are registered directly with `CheckinService` mocked, so no
 * database is involved. That is deliberate on two counts. The service's own
 * logic already has 50 unit tests behind it, and what is untested is everything
 * *around* it; and this project's convention is that tests never connect to
 * Postgres. Module wiring is `checkin.module.spec.ts`'s job.
 *
 * `APP_PIPE` and `APP_FILTER` are copied verbatim from `app.module.ts` because
 * they are DI-scoped to `AppModule` — a fixture that does not import it gets
 * neither, and every status-code assertion here would silently test Nest's
 * defaults instead of this app's.
 */
describe('CheckIns (e2e) — EF-10, EF-11, EF-12, ENF-05', () => {
  let app: INestApplication;
  let service: ServiceMock;
  let userToken: string;
  let otherUserToken: string;

  beforeAll(async () => {
    service = {
      create: jest.fn(),
      checkout: jest.fn(),
      getCrowdStatus: jest.fn(),
      getCheckInBySessionToken: jest.fn(),
      getUserCheckIns: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [CheckinController, UserCheckinsController],
      providers: [
        JwtStrategy,
        // JwtStrategy reads jwt.secret from config; hand it the test secret.
        { provide: ConfigService, useValue: { get: () => TEST_SECRET } },
        { provide: CheckinService, useValue: service },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
            stopAtFirstError: false,
          }),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const jwt = moduleFixture.get(JwtService);
    userToken = jwt.sign({
      sub: USER_ID,
      email: 'fan1@test.local',
      role: UserRole.USER,
    });
    otherUserToken = jwt.sign({
      sub: 'b2c3d4e5-6f70-4819-a2b3-c4d5e6f70819',
      email: 'fan2@test.local',
      role: UserRole.USER,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const bearer = (token: string) => `Bearer ${token}`;
  const http = () => request(app.getHttpServer());

  describe('POST /checkins (EF-10)', () => {
    const body = { fanzoneId: FANZONE_ID, teamId: TEAM_ID };

    it('creates a check-in and answers 201', async () => {
      service.create.mockResolvedValue(makeCheckin());

      const res = await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(201);

      expect(res.body).toEqual({
        sessionToken: SESSION_TOKEN,
        fanzoneId: FANZONE_ID,
        teamName: 'Tunisia',
        createdAt: CREATED_AT.toISOString(),
      });
    });

    it('takes the user id from the token, never from the body', async () => {
      service.create.mockResolvedValue(makeCheckin());

      await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(201);

      expect(service.create).toHaveBeenCalledWith(USER_ID, body);
    });

    it('rejects an unauthenticated request with 401', async () => {
      await http().post('/checkins').send(body).expect(401);

      // The guard has to stop it before the service is ever reached.
      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects a token signed with the wrong secret with 401', async () => {
      const forged = new JwtService({ secret: 'wrong-secret' }).sign({
        sub: USER_ID,
        email: 'fan1@test.local',
        role: UserRole.USER,
      });

      await http()
        .post('/checkins')
        .set('Authorization', bearer(forged))
        .send(body)
        .expect(401);
    });

    it('rejects a malformed fanzoneId with 400', async () => {
      await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send({ ...body, fanzoneId: 'not-a-uuid' })
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });

    it('rejects a body naming a user or a token with 400 (ENF-05)', async () => {
      // `forbidNonWhitelisted` is what stops a caller checking somebody else in,
      // or choosing the token that identifies the check-in.
      await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send({ ...body, userId: 'someone-else' })
        .expect(400);

      await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send({ ...body, sessionToken: SESSION_TOKEN })
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
    });

    it('maps NotFoundException from the service onto 404', async () => {
      // Covers both an unknown fanzoneId and an unknown teamId — the service
      // distinguishes them by message, the wire status is the same.
      service.create.mockRejectedValue(new NotFoundException('Team not found'));

      const res = await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(404);

      expect(bodyOf(res).statusCode).toBe(404);
    });

    it('maps BadRequestException from the service onto 400', async () => {
      service.create.mockRejectedValue(
        new BadRequestException('That team is not broadcast at this fan zone'),
      );

      await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(400);
    });

    it('returns a sessionToken and no user identifier (ENF-05)', async () => {
      service.create.mockResolvedValue(makeCheckin());

      const res = await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(201);

      expect(bodyOf(res).sessionToken).toBe(SESSION_TOKEN);
      expect(res.body).not.toHaveProperty('userId');
      expect(res.body).not.toHaveProperty('email');
      expect(res.body).not.toHaveProperty('user');
      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain(USER_ID);
      expect(serialised).not.toContain('@');
    });

    it('gives two fans at the same zone different session tokens', async () => {
      const tokenA = SESSION_TOKEN;
      const tokenB = '3b241101-e2bb-4255-8caf-4136c566a962';
      service.create
        .mockResolvedValueOnce(makeCheckin({ sessionToken: tokenA }))
        .mockResolvedValueOnce(makeCheckin({ sessionToken: tokenB }));

      const first = await http()
        .post('/checkins')
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(201);
      const second = await http()
        .post('/checkins')
        .set('Authorization', bearer(otherUserToken))
        .send(body)
        .expect(201);

      expect(bodyOf(first).sessionToken).not.toBe(bodyOf(second).sessionToken);
    });
  });

  describe('GET /checkins/:sessionToken (EF-10, ENF-05)', () => {
    it('returns the check-in with 200', async () => {
      service.getCheckInBySessionToken.mockResolvedValue(makeCheckin());

      const res = await http().get(`/checkins/${SESSION_TOKEN}`).expect(200);

      expect(res.body).toEqual({
        sessionToken: SESSION_TOKEN,
        fanzoneId: FANZONE_ID,
        fanzoneInfo: {
          name: 'Tunis Stadium',
          city: 'Tunis',
          address: '123 Main St',
        },
        teamName: 'Tunisia',
        checkedInAt: CREATED_AT.toISOString(),
      });
    });

    it('is public — no Authorization header needed', async () => {
      service.getCheckInBySessionToken.mockResolvedValue(makeCheckin());

      // The token is the credential. A venue scanner holds no fan's JWT.
      await http().get(`/checkins/${SESSION_TOKEN}`).expect(200);
    });

    it('answers 404 for an unknown token', async () => {
      service.getCheckInBySessionToken.mockRejectedValue(
        new NotFoundException('Check-in not found'),
      );

      await http().get(`/checkins/${SESSION_TOKEN}`).expect(404);
    });

    it('answers 400 for a malformed token, not 500', async () => {
      // ParseUUIDPipe catches it before the driver rejects the uuid cast.
      await http().get('/checkins/not-a-uuid').expect(400);

      expect(service.getCheckInBySessionToken).not.toHaveBeenCalled();
    });

    it('redacts the token from the error body (ENF-05)', async () => {
      service.getCheckInBySessionToken.mockRejectedValue(
        new NotFoundException('Check-in not found'),
      );

      const res = await http().get(`/checkins/${SESSION_TOKEN}`).expect(404);

      // The route is public, so the token is a standalone read credential —
      // echoing it back in an error body writes it into the caller's logs too.
      expect(bodyOf(res).path).toBe('/checkins/:uuid');
      expect(JSON.stringify(res.body)).not.toContain(SESSION_TOKEN);
    });

    it('exposes no user identifier or fan zone internals (ENF-05)', async () => {
      service.getCheckInBySessionToken.mockResolvedValue(makeCheckin());

      const res = await http().get(`/checkins/${SESSION_TOKEN}`).expect(200);

      expect(res.body).not.toHaveProperty('userId');
      expect(Object.keys(bodyOf(res).fanzoneInfo as JsonBody).sort()).toEqual([
        'address',
        'city',
        'name',
      ]);
      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain(USER_ID);
      expect(serialised).not.toContain('@');
      expect(serialised).not.toContain('capacity');
    });
  });

  describe('DELETE /checkins/:sessionToken (EF-10, EF-12)', () => {
    const body = { sessionToken: SESSION_TOKEN, fanzoneId: FANZONE_ID };

    it('checks the owner out with 200', async () => {
      service.checkout.mockResolvedValue(undefined);

      const res = await http()
        .delete(`/checkins/${SESSION_TOKEN}`)
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(200);

      expect(res.body).toEqual({ message: 'Checked out successfully' });
      expect(service.checkout).toHaveBeenCalledWith(
        USER_ID,
        SESSION_TOKEN,
        FANZONE_ID,
      );
    });

    it('rejects an unauthenticated request with 401', async () => {
      await http().delete(`/checkins/${SESSION_TOKEN}`).send(body).expect(401);

      expect(service.checkout).not.toHaveBeenCalled();
    });

    it("answers 403 for another user's check-in", async () => {
      service.checkout.mockRejectedValue(
        new ForbiddenException('That check-in belongs to another user'),
      );

      await http()
        .delete(`/checkins/${SESSION_TOKEN}`)
        .set('Authorization', bearer(otherUserToken))
        .send(body)
        .expect(403);
    });

    it('answers 404 for an unknown token', async () => {
      service.checkout.mockRejectedValue(
        new NotFoundException('Check-in not found'),
      );

      await http()
        .delete(`/checkins/${SESSION_TOKEN}`)
        .set('Authorization', bearer(userToken))
        .send(body)
        .expect(404);
    });

    it('answers 400 when the path and body tokens disagree', async () => {
      await http()
        .delete(`/checkins/${SESSION_TOKEN}`)
        .set('Authorization', bearer(userToken))
        .send({ ...body, sessionToken: '3b241101-e2bb-4255-8caf-4136c566a962' })
        .expect(400);

      expect(service.checkout).not.toHaveBeenCalled();
    });

    it('answers 400 when the body is missing', async () => {
      // Both fields are validated: a stale token must not be able to free a
      // spot at a fan zone the check-in was not made at.
      await http()
        .delete(`/checkins/${SESSION_TOKEN}`)
        .set('Authorization', bearer(userToken))
        .expect(400);

      expect(service.checkout).not.toHaveBeenCalled();
    });
  });

  describe('GET /checkins/crowd|fanzone/:fanzoneId (EF-11, EF-12)', () => {
    const snapshot = {
      fanzoneId: FANZONE_ID,
      totalPresent: 5,
      byTeam: [
        { teamName: 'Tunisia', count: 3, percentage: 60 },
        { teamName: 'France', count: 2, percentage: 40 },
      ],
      occupancyPercentage: 5,
      updatedAt: CREATED_AT.toISOString(),
    };

    it('returns the crowd snapshot with 200', async () => {
      service.getCrowdStatus.mockResolvedValue(snapshot);

      const res = await http().get(`/checkins/crowd/${FANZONE_ID}`).expect(200);

      expect(res.body).toEqual(snapshot);
    });

    it('serves the same snapshot on the fanzone/ alias', async () => {
      service.getCrowdStatus.mockResolvedValue(snapshot);
      const viaCrowd = await http()
        .get(`/checkins/crowd/${FANZONE_ID}`)
        .expect(200);

      service.getCrowdStatus.mockResolvedValue(snapshot);
      const viaFanzone = await http()
        .get(`/checkins/fanzone/${FANZONE_ID}`)
        .expect(200);

      // `fanzone/` is the path named in the WBS, `crowd/` describes the payload.
      expect(viaFanzone.body).toEqual(viaCrowd.body);
    });

    it('is public on both paths', async () => {
      service.getCrowdStatus.mockResolvedValue(snapshot);

      await http().get(`/checkins/crowd/${FANZONE_ID}`).expect(200);
      await http().get(`/checkins/fanzone/${FANZONE_ID}`).expect(200);
    });

    it('answers 404 for an unknown fan zone', async () => {
      service.getCrowdStatus.mockRejectedValue(
        new NotFoundException('Fan zone not found'),
      );

      await http().get(`/checkins/crowd/${FANZONE_ID}`).expect(404);
    });

    it('answers 400 for a malformed fan zone id', async () => {
      await http().get('/checkins/crowd/not-a-uuid').expect(400);

      expect(service.getCrowdStatus).not.toHaveBeenCalled();
    });

    it('returns aggregates only, with no per-person value (ENF-05)', async () => {
      service.getCrowdStatus.mockResolvedValue(snapshot);

      const res = await http().get(`/checkins/crowd/${FANZONE_ID}`).expect(200);

      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain(USER_ID);
      expect(serialised).not.toContain('@');
      expect(serialised).not.toContain('sessionToken');
    });
  });

  describe('GET /users/checkins (EF-10, ENF-05)', () => {
    it('rejects an unauthenticated request with 401', async () => {
      await http().get('/users/checkins').expect(401);

      expect(service.getUserCheckIns).not.toHaveBeenCalled();
    });

    it("returns the caller's own check-ins with 200", async () => {
      service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

      const res = await http()
        .get('/users/checkins')
        .set('Authorization', bearer(userToken))
        .expect(200);

      // Selected by the id on the verified token, never by anything supplied.
      expect(service.getUserCheckIns).toHaveBeenCalledWith(USER_ID);
      const listing = bodyOf(res).sessionTokens as JsonBody[];
      expect(listing).toHaveLength(1);
      expect(listing[0].teamName).toBe('Tunisia');
    });

    it('exposes no user identifier (ENF-05)', async () => {
      service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

      const res = await http()
        .get('/users/checkins')
        .set('Authorization', bearer(userToken))
        .expect(200);

      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain(USER_ID);
      expect(serialised).not.toContain('@');
      expect(serialised).not.toContain('capacity');
    });
  });
});
