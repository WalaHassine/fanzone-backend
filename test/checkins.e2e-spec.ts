import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { CheckinController } from '../src/modules/checkin/checkin.controller';
import { UserCheckinsController } from '../src/modules/checkin/user-checkins.controller';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { CheckinEntity } from '../src/modules/checkin/entities/checkin.entity';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RolesGuard } from '../src/common/guards';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UserRole } from '../src/modules/user/entities/user.entity';

const TEST_SECRET = 'e2e-test-secret';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const OTHER_USER_ID = 'b2c3d4e5-6f70-4819-a2b3-c4d5e6f70819';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const OTHER_TOKEN = '3b241101-e2bb-4255-8caf-4136c566a962';
const CREATED_AT = '2026-07-27T18:30:00.000Z';
const USER_EMAIL = 'fan1@test.local';

/** supertest types `Response.body` as `any`; narrowed once here. */
type JsonBody = Record<string, unknown>;
const bodyOf = (res: request.Response): JsonBody => res.body as JsonBody;

/**
 * A check-in as the service hands it back: carrying the stored `userId` and the
 * eager relations, with more on the fan zone than either mapper returns.
 *
 * Deliberately over-populated — `user.email`, `fanzone.capacity` and the PostGIS
 * `location` are what give the ENF-05 assertions below something real to catch.
 * A mapper that started spreading instead of naming fields would fail here.
 */
function makeCheckin(overrides: Partial<CheckinEntity> = {}): CheckinEntity {
  return {
    id: 'checkin-uuid-a',
    userId: USER_ID,
    sessionToken: SESSION_TOKEN,
    fanzoneId: FANZONE_ID,
    teamId: TEAM_ID,
    createdAt: new Date(CREATED_AT),
    user: { id: USER_ID, email: USER_EMAIL },
    fanzone: {
      id: FANZONE_ID,
      name: 'Tunis Stadium',
      city: 'Tunis',
      address: '123 Main St',
      capacity: 100,
      availableSpots: 95,
      location: { type: 'Point', coordinates: [10.18, 36.8] },
    },
    team: { id: TEAM_ID, name: 'Tunisia' },
    ...overrides,
  } as unknown as CheckinEntity;
}

type ServiceMock = jest.Mocked<
  Pick<CheckinService, 'getCheckInBySessionToken' | 'getUserCheckIns'>
>;

/**
 * Check-in read endpoints over real HTTP (EF-10, ENF-05).
 *
 * The layer the unit specs cannot reach. `checkin.controller.spec.ts` and
 * `user-checkins.controller.spec.ts` call handlers directly and assert guarding
 * by reading decorator metadata — which proves the decorator is present, not
 * that Nest honours it. This suite is the only place that shows
 * `GET /checkins/:sessionToken` really answers an unauthenticated caller, that
 * `GET /users/checkins` really answers 401 without a token, and that a thrown
 * `NotFoundException` becomes a 404 rather than a 500 on the wire.
 *
 * Both read routes are covered together because they return the same fields
 * onto two separate DTOs, and the pair is only worth keeping separate if
 * something asserts they can diverge without one silently following the other.
 *
 * Follows `recommendations.e2e-spec.ts`: real controllers, `CheckinService`
 * mocked, no database — this project's tests never connect to Postgres. The
 * service's own behaviour (the presence window, the capacity transaction, the
 * duplicate guard) is covered by its unit suite.
 *
 * `APP_PIPE` and `APP_FILTER` are copied verbatim from `app.module.ts` because
 * they are DI-scoped to `AppModule`; without them every status assertion here
 * would be testing Nest's defaults instead of this application's.
 */
describe('Check-ins (e2e) — EF-10, ENF-05', () => {
  let app: INestApplication;
  let service: ServiceMock;
  let userToken: string;

  beforeAll(async () => {
    service = {
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
        Reflector,
        RolesGuard,
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

    userToken = moduleFixture.get(JwtService).sign({
      sub: USER_ID,
      email: USER_EMAIL,
      role: UserRole.USER,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const bearer = (token: string) => `Bearer ${token}`;
  const http = () => request(app.getHttpServer());

  describe('GET /checkins/:sessionToken — public (EF-10)', () => {
    it('returns the check-in with its fan zone and team', async () => {
      service.getCheckInBySessionToken.mockResolvedValue(makeCheckin());

      const res = await http().get(`/checkins/${SESSION_TOKEN}`).expect(200);

      expect(bodyOf(res)).toEqual({
        sessionToken: SESSION_TOKEN,
        fanzoneId: FANZONE_ID,
        fanzoneInfo: {
          name: 'Tunis Stadium',
          city: 'Tunis',
          address: '123 Main St',
        },
        teamName: 'Tunisia',
        checkedInAt: CREATED_AT,
      });
    });

    // The point of the route: a venue scanner at the gate holds no fan's JWT.
    it('answers without any Authorization header at all', async () => {
      service.getCheckInBySessionToken.mockResolvedValue(makeCheckin());

      await http().get(`/checkins/${SESSION_TOKEN}`).expect(200);

      expect(service.getCheckInBySessionToken).toHaveBeenCalledWith(
        SESSION_TOKEN,
      );
    });

    it('is not fooled into 401 by a malformed Authorization header', async () => {
      service.getCheckInBySessionToken.mockResolvedValue(makeCheckin());

      await http()
        .get(`/checkins/${SESSION_TOKEN}`)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(200);
    });

    it('surfaces the service 404 as a 404, not a 500', async () => {
      service.getCheckInBySessionToken.mockRejectedValue(
        new NotFoundException('Check-in not found'),
      );

      const res = await http().get(`/checkins/${OTHER_TOKEN}`).expect(404);

      // HttpExceptionFilter nests the exception's own payload under `message`.
      const body = bodyOf(res);
      expect(body.statusCode).toBe(404);
      expect((body.message as JsonBody).message).toBe('Check-in not found');
    });

    // The token is a credential, so redactPath keeps it out of the error body
    // and the log line the filter writes beside it.
    it('redacts the session token from the error payload path', async () => {
      service.getCheckInBySessionToken.mockRejectedValue(
        new NotFoundException('Check-in not found'),
      );

      const res = await http().get(`/checkins/${OTHER_TOKEN}`).expect(404);

      expect(bodyOf(res).path).not.toContain(OTHER_TOKEN);
    });

    // Without ParseUUIDPipe the driver rejects the uuid cast and this is a 500.
    it('rejects a malformed token with 400 before reaching the service', async () => {
      await http().get('/checkins/not-a-uuid').expect(400);

      expect(service.getCheckInBySessionToken).not.toHaveBeenCalled();
    });
  });

  describe('GET /users/checkins — authenticated (EF-10)', () => {
    it("returns the caller's check-ins under the sessionTokens key", async () => {
      service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

      const res = await http()
        .get('/users/checkins')
        .set('Authorization', bearer(userToken))
        .expect(200);

      expect(bodyOf(res)).toEqual({
        sessionTokens: [
          {
            sessionToken: SESSION_TOKEN,
            fanzoneId: FANZONE_ID,
            fanzoneInfo: {
              name: 'Tunis Stadium',
              city: 'Tunis',
              address: '123 Main St',
            },
            teamName: 'Tunisia',
            checkedInAt: CREATED_AT,
          },
        ],
      });
    });

    it('returns an empty list rather than 404 when the fan has none', async () => {
      service.getUserCheckIns.mockResolvedValue([]);

      const res = await http()
        .get('/users/checkins')
        .set('Authorization', bearer(userToken))
        .expect(200);

      expect(bodyOf(res)).toEqual({ sessionTokens: [] });
    });

    it('answers 401 without a token', async () => {
      await http().get('/users/checkins').expect(401);

      expect(service.getUserCheckIns).not.toHaveBeenCalled();
    });

    it('answers 401 for a token signed with the wrong secret', async () => {
      const forged = new JwtService({ secret: 'not-the-secret' }).sign({
        sub: OTHER_USER_ID,
        email: 'attacker@test.local',
        role: UserRole.USER,
      });

      await http()
        .get('/users/checkins')
        .set('Authorization', bearer(forged))
        .expect(401);

      expect(service.getUserCheckIns).not.toHaveBeenCalled();
    });

    // The whole scoping guarantee: the id comes off the verified token, so
    // there is no request field an attacker could point at another fan.
    it('scopes the query to the id on the token', async () => {
      service.getUserCheckIns.mockResolvedValue([]);

      await http()
        .get('/users/checkins')
        .query({ userId: OTHER_USER_ID })
        .set('Authorization', bearer(userToken))
        .expect(200);

      expect(service.getUserCheckIns).toHaveBeenCalledWith(USER_ID);
      expect(service.getUserCheckIns).not.toHaveBeenCalledWith(OTHER_USER_ID);
    });

    it('preserves the order the service returned, newest first', async () => {
      const older = makeCheckin({
        sessionToken: OTHER_TOKEN,
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
      });
      service.getUserCheckIns.mockResolvedValue([makeCheckin(), older]);

      const res = await http()
        .get('/users/checkins')
        .set('Authorization', bearer(userToken))
        .expect(200);

      const items = bodyOf(res).sessionTokens as JsonBody[];
      expect(items.map((item) => item.sessionToken)).toEqual([
        SESSION_TOKEN,
        OTHER_TOKEN,
      ]);
    });
  });

  describe('ENF-05 — no personal data on the wire', () => {
    it.each([
      ['public detail', () => http().get(`/checkins/${SESSION_TOKEN}`)],
      [
        'authenticated listing',
        () =>
          http().get('/users/checkins').set('Authorization', bearer(userToken)),
      ],
    ])(
      '%s carries no identifier, email or coordinates',
      async (_label, call) => {
        service.getCheckInBySessionToken.mockResolvedValue(makeCheckin());
        service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

        const res = await call().expect(200);
        const serialised = JSON.stringify(bodyOf(res));

        expect(serialised).not.toContain(USER_ID);
        expect(serialised).not.toContain('@');
        expect(serialised).not.toContain('coordinates');
        expect(serialised).not.toContain('capacity');
        expect(serialised).not.toContain('availableSpots');
      },
    );
  });
});
