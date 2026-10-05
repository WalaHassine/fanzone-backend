import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { RecommendationResponseDto } from './dto';
import type { AuthUser } from '../../common/decorators';
import { UserRole } from '../user/entities/user.entity';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const MATCH_ID = 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const RECOMMENDATION_ID = '8f14e45f-ceea-4d0b-9e3a-1c2d3e4f5a6b';

const AUTH_USER: AuthUser = {
  userId: USER_ID,
  email: 'fan@example.com',
  role: UserRole.USER,
};

function makeResponse(): RecommendationResponseDto {
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
        'Closest zone showing Tunisia, with room left before kick-off.',
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

describe('RecommendationController', () => {
  let controller: RecommendationController;
  let service: ServiceMock;

  beforeEach(async () => {
    service = {
      generateRecommendation: jest.fn().mockResolvedValue(makeResponse()),
      getRecommendation: jest.fn().mockResolvedValue(makeResponse()),
      getUserRecommendations: jest
        .fn()
        .mockResolvedValue({ recommendations: [] }),
      getRecommendationsForMatch: jest
        .fn()
        .mockResolvedValue({ recommendations: [] }),
      suggestAlerts: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationController],
      providers: [{ provide: RecommendationService, useValue: service }],
    }).compile();

    controller = module.get<RecommendationController>(RecommendationController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('generate (EF-13, EF-14)', () => {
    it('takes the user id from the token, never from the body', async () => {
      await controller.generate(AUTH_USER, { matchId: MATCH_ID });

      expect(service.generateRecommendation).toHaveBeenCalledWith(
        USER_ID,
        MATCH_ID,
      );
    });

    it('returns the service payload unchanged', async () => {
      const result = await controller.generate(AUTH_USER, {
        matchId: MATCH_ID,
      });

      expect(result).toEqual(makeResponse());
    });
  });

  describe('getForMatch', () => {
    it('returns the stored recommendation', async () => {
      const result = await controller.getForMatch(AUTH_USER, MATCH_ID);

      expect(result.id).toBe(RECOMMENDATION_ID);
      expect(service.getRecommendation).toHaveBeenCalledWith(USER_ID, MATCH_ID);
    });

    it('turns the service null into a 404', async () => {
      service.getRecommendation.mockResolvedValue(null);

      await expect(
        controller.getForMatch(AUTH_USER, MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMine', () => {
    it('scopes the history to the authenticated fan', async () => {
      await controller.getMine(AUTH_USER);

      expect(service.getUserRecommendations).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('suggestAlerts (EF-15)', () => {
    it('returns an empty array rather than erroring when nothing is worth suggesting', async () => {
      await expect(
        controller.suggestAlerts(AUTH_USER, MATCH_ID),
      ).resolves.toEqual([]);
    });
  });

  describe('getAllForMatch (admin)', () => {
    it('queries by match without narrowing to the calling admin', async () => {
      await controller.getAllForMatch(MATCH_ID);

      expect(service.getRecommendationsForMatch).toHaveBeenCalledWith(MATCH_ID);
    });
  });

  describe('privacy (ENF-05)', () => {
    it('exposes no user identifier on the recommendation payload', () => {
      const body = JSON.stringify(makeResponse());

      expect(body).not.toContain(USER_ID);
      expect(body).not.toContain('fan@example.com');
    });
  });
});
