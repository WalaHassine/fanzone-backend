import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { RecommendationController } from '../src/modules/recommendation/recommendation.controller';
import { RecommendationService } from '../src/modules/recommendation/recommendation.service';
import { RecommendationResponseDto } from '../src/modules/recommendation/dto';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RolesGuard } from '../src/common/guards';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { UserRole } from '../src/modules/user/entities/user.entity';

const TEST_SECRET = 'e2e-test-secret';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const MATCH_ID = 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const RECOMMENDATION_ID = '8f14e45f-ceea-4d0b-9e3a-1c2d3e4f5a6b';
const USER_EMAIL = 'fan1@test.local';

/** supertest types `Response.body` as `any`; narrowed once here. */
type JsonBody = Record<string, unknown>;
const bodyOf = (res: request.Response): JsonBody => res.body as JsonBody;

function makeResponse(
  overrides: Partial<RecommendationResponseDto> = {},
): RecommendationResponseDto {
  return {
    id: RECOMMENDATION_ID,
    matchId: MATCH_ID,
    recommendedFanzoneId: FANZONE_ID,
    recommendedFanzoneName: 'Bab Bhar Fan Zone',
    recommendation: {
      fanzoneInfo: {
        id: FANZONE_ID,
        name: 'Bab Bhar Fan Zone',
        city: 'Tunis',
        address: '1 Avenue Habib Bourguiba',
        distance: 3.2,
        capacity: 1000,
        availableSpots: 400,
        occupancyPercentage: 60,
        teamsSupported: ['Tunisia'],
        openingHour: '18:00',
        closingHour: '00:00',
      },
      explanation:
        'Closest zone to you showing Tunisia, and still with room before kick-off.',
      matchInfo: {
        homeTeam: 'Tunisia',
        awayTeam: 'France',
        matchDate: '2026-06-18T19:00:00.000Z',
        stadium: 'Stade de Rades',
      },
      reasoning: {
        matchesTeamPreference: true,
        distanceFromUser: '3.2 km away',
        crowdLevel: '60% occupied',
        ambianceMatch: 'Supporters atmosphere',
      },
      score: 0.87,
    },
    createdAt: '2026-06-18T17:42:00.000Z',
    ...overrides,
  };
}

type ServiceMock = jest.Mocked<
  Pick<
    RecommendationService,
    | 'generateRecommendation'
    | 'getRecommendation'
    | 'getUserRecommendations'
    | 'getRecommendationsForMatch'
    | 'suggestAlerts'
  >
>;

/**
 * Recommendation endpoints over real HTTP (EF-13, EF-14, EF-15, ENF-01).
 *
 * The layer the unit specs cannot reach: the routes themselves, `JwtAuthGuard`,
 * `RolesGuard`, `ParseUUIDPipe`, the global `ValidationPipe` and the global
 * `HttpExceptionFilter`. This is the only place that proves a thrown
 * `NotFoundException` becomes a 404 on the wire, that the admin route actually
 * answers 403 to a plain fan, and that a body-supplied `userId` is rejected
 * rather than quietly dropped.
 *
 * Follows `checkins.e2e-spec.ts`: the real controller with `RecommendationService`
 * mocked, and no database — this project's tests never connect to Postgres. The
 * service's own behaviour (cache TTL, filter relaxation, the AI fallback) is
 * covered by its 45 unit tests, and how long a real Groq call takes is a
 * question no mocked suite can answer; that lives in
 * `docs/groq-verification-checklist.md`.
 *
 * `APP_PIPE` and `APP_FILTER` are copied verbatim from `app.module.ts` because
 * they are DI-scoped to `AppModule`; without them every status assertion here
 * would be testing Nest's defaults instead of this application's.
 */
describe('Recommendations (e2e) — EF-13, EF-14, EF-15, ENF-01', () => {
  let app: INestApplication;
  let service: ServiceMock;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    service = {
      generateRecommendation: jest.fn(),
      getRecommendation: jest.fn(),
      getUserRecommendations: jest.fn(),
      getRecommendationsForMatch: jest.fn(),
      suggestAlerts: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [RecommendationController],
      providers: [
        JwtStrategy,
        Reflector,
        RolesGuard,
        { provide: ConfigService, useValue: { get: () => TEST_SECRET } },
        { provide: RecommendationService, useValue: service },
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
      email: USER_EMAIL,
      role: UserRole.USER,
    });
    adminToken = jwt.sign({
      sub: 'b2c3d4e5-6f70-4819-a2b3-c4d5e6f70819',
      email: 'admin@test.local',
      role: UserRole.ADMIN,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const bearer = (token: string) => `Bearer ${token}`;
  const http = () => request(app.getHttpServer());

  describe('POST /recommendations/generate (EF-13, EF-14)', () => {
    it('returns 201 with the full recommendation shape', async () => {
      service.generateRecommendation.mockResolvedValue(makeResponse());

      const res = await http()
        .post('/recommendations/generate')
        .set('Authorization', bearer(userToken))
        .send({ matchId: MATCH_ID })
        .expect(201);

      expect(bodyOf(res)).toEqual(makeResponse());
    });

    it('carries the three nested blocks the client renders', async () => {
      service.generateRecommendation.mockResolvedValue(makeResponse());

      const res = await http()
        .post('/recommendations/generate')
        .set('Authorization', bearer(userToken))
        .send({ matchId: MATCH_ID })
        .expect(201);

      const recommendation = bodyOf(res).recommendation as JsonBody;
      expect(recommendation.fanzoneInfo).toBeDefined();
      expect(recommendation.matchInfo).toBeDefined();
      expect(recommendation.reasoning).toBeDefined();
      expect(typeof recommendation.explanation).toBe('string');
      expect(typeof recommendation.score).toBe('number');
    });

    it('takes the user id from the token, never from the body', async () => {
      service.generateRecommendation.mockResolvedValue(makeResponse());

      await http()
        .post('/recommendations/generate')
        .set('Authorization', bearer(userToken))
        .send({ matchId: MATCH_ID })
        .expect(201);

      expect(service.generateRecommendation).toHaveBeenCalledWith(
        USER_ID,
        MATCH_ID,
      );
    });

    it('rejects a body that tries to name a different user', async () => {
      await http()
        .post('/recommendations/generate')
        .set('Authorization', bearer(userToken))
        .send({ matchId: MATCH_ID, userId: 'someone-else' })
        .expect(400);

      expect(service.generateRecommendation).not.toHaveBeenCalled();
    });

    it('rejects a malformed match id with 400', async () => {
      await http()
        .post('/recommendations/generate')
        .set('Authorization', bearer(userToken))
        .send({ matchId: 'not-a-uuid' })
        .expect(400);
    });

    it('answers 401 without a token', async () => {
      await http()
        .post('/recommendations/generate')
        .send({ matchId: MATCH_ID })
        .expect(401);
    });

    it('surfaces a NotFoundException from the service as 404', async () => {
      service.generateRecommendation.mockRejectedValue(
        new NotFoundException('Match not found'),
      );

      await http()
        .post('/recommendations/generate')
        .set('Authorization', bearer(userToken))
        .send({ matchId: MATCH_ID })
        .expect(404);
    });

    it('surfaces a BadRequestException from the service as 400', async () => {
      service.generateRecommendation.mockRejectedValue(
        new BadRequestException('No fan zones are available for this match'),
      );

      await http()
        .post('/recommendations/generate')
        .set('Authorization', bearer(userToken))
        .send({ matchId: MATCH_ID })
        .expect(400);
    });
  });

  describe('GET /recommendations/match/:matchId', () => {
    it('returns the stored recommendation', async () => {
      service.getRecommendation.mockResolvedValue(makeResponse());

      const res = await http()
        .get(`/recommendations/match/${MATCH_ID}`)
        .set('Authorization', bearer(userToken))
        .expect(200);

      expect(bodyOf(res).id).toBe(RECOMMENDATION_ID);
    });

    it('answers 404 when the fan has no recommendation for the match', async () => {
      service.getRecommendation.mockResolvedValue(null);

      await http()
        .get(`/recommendations/match/${MATCH_ID}`)
        .set('Authorization', bearer(userToken))
        .expect(404);
    });

    it('answers 400 for a malformed match id', async () => {
      await http()
        .get('/recommendations/match/not-a-uuid')
        .set('Authorization', bearer(userToken))
        .expect(400);

      expect(service.getRecommendation).not.toHaveBeenCalled();
    });

    it('answers 401 without a token', async () => {
      await http().get(`/recommendations/match/${MATCH_ID}`).expect(401);
    });
  });

  describe('GET /recommendations/me', () => {
    it('returns the wrapped history for the calling fan', async () => {
      service.getUserRecommendations.mockResolvedValue({
        recommendations: [makeResponse()],
      });

      const res = await http()
        .get('/recommendations/me')
        .set('Authorization', bearer(userToken))
        .expect(200);

      expect(Array.isArray(bodyOf(res).recommendations)).toBe(true);
      expect(service.getUserRecommendations).toHaveBeenCalledWith(USER_ID);
    });

    it('answers 401 without a token', async () => {
      await http().get('/recommendations/me').expect(401);
    });
  });

  describe('GET /recommendations/match/:matchId/alerts (EF-15)', () => {
    const suggestion = {
      matchId: MATCH_ID,
      homeTeam: 'Tunisia',
      awayTeam: 'France',
      matchDate: '2026-06-18T19:00:00.000Z',
      teamName: 'Tunisia',
      suggestedTriggerTimes: [
        {
          label: '24 hours before',
          offsetSeconds: 86400,
          triggerTime: '2026-06-17T19:00:00.000Z',
        },
      ],
    };

    it('returns the suggested alert times with absolute instants', async () => {
      service.suggestAlerts.mockResolvedValue([suggestion]);

      const res = await http()
        .get(`/recommendations/match/${MATCH_ID}/alerts`)
        .set('Authorization', bearer(userToken))
        .expect(200);

      expect(res.body).toEqual([suggestion]);
    });

    it('returns an empty array rather than a 404 when nothing is worth suggesting', async () => {
      service.suggestAlerts.mockResolvedValue([]);

      const res = await http()
        .get(`/recommendations/match/${MATCH_ID}/alerts`)
        .set('Authorization', bearer(userToken))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('answers 401 without a token', async () => {
      await http().get(`/recommendations/match/${MATCH_ID}/alerts`).expect(401);
    });
  });

  describe('GET /recommendations/match/:matchId/all (admin)', () => {
    it('lets an admin read every recommendation for the match', async () => {
      service.getRecommendationsForMatch.mockResolvedValue({
        recommendations: [makeResponse()],
      });

      const res = await http()
        .get(`/recommendations/match/${MATCH_ID}/all`)
        .set('Authorization', bearer(adminToken))
        .expect(200);

      expect(bodyOf(res).recommendations).toHaveLength(1);
    });

    it('answers 403 to an ordinary fan', async () => {
      await http()
        .get(`/recommendations/match/${MATCH_ID}/all`)
        .set('Authorization', bearer(userToken))
        .expect(403);

      expect(service.getRecommendationsForMatch).not.toHaveBeenCalled();
    });

    it('answers 401 without a token', async () => {
      await http().get(`/recommendations/match/${MATCH_ID}/all`).expect(401);
    });
  });

  describe('privacy (ENF-05)', () => {
    it('never returns a user id or email on any recommendation route', async () => {
      service.generateRecommendation.mockResolvedValue(makeResponse());
      service.getUserRecommendations.mockResolvedValue({
        recommendations: [makeResponse()],
      });
      service.getRecommendationsForMatch.mockResolvedValue({
        recommendations: [makeResponse()],
      });

      const responses = await Promise.all([
        http()
          .post('/recommendations/generate')
          .set('Authorization', bearer(userToken))
          .send({ matchId: MATCH_ID }),
        http()
          .get('/recommendations/me')
          .set('Authorization', bearer(userToken)),
        http()
          .get(`/recommendations/match/${MATCH_ID}/all`)
          .set('Authorization', bearer(adminToken)),
      ]);

      for (const res of responses) {
        const serialised = JSON.stringify(res.body);
        expect(serialised).not.toContain(USER_ID);
        expect(serialised).not.toContain(USER_EMAIL);
      }
    });
  });
});
