import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  FALLBACK_EXPLANATION,
  FALLBACK_SCORE,
  RecommendationService,
  USER_HISTORY_LIMIT,
} from './recommendation.service';
import { RecommendationEntity } from './entities/recommendation.entity';
import { UserEntity } from '../user/entities/user.entity';
import { MatchEntity, MatchStatus } from '../match/entities/match.entity';
import { AlertEntity } from '../alert/entities/alert.entity';
import { FanzoneEntity } from '../fanzone/entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { AmbiancePreference } from '../user/entities/user-preference.entity';
import {
  FanzoneService,
  FanzoneWithDistance,
} from '../fanzone/fanzone.service';
import { AiService } from './services/ai.service';
import { AiServiceError } from './services/ai.errors';
import { AiRecommendationOutputDto } from './dto';
import { CITY_COORDINATES } from './city-coordinates';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const MATCH_ID = 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70';
const NEAR_ZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const FAR_ZONE_ID = '9c8d7e6f-1a2b-4c3d-9e8f-7a6b5c4d3e2f';
const RECOMMENDATION_ID = '8f14e45f-ceea-4d0b-9e3a-1c2d3e4f5a6b';

const CREATED_AT = new Date('2026-06-18T17:42:00.000Z');
/** Kick-off at 19:00 UTC — inside an 18:00→00:00 window, outside 09:00→17:00. */
const MATCH_DATE = new Date('2026-06-18T19:00:00.000Z');

type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<Repository<T>, 'findOne'>
>;

/** The chainable subset of the DISTINCT ON builder `getUserRecommendations` drives. */
type QueryBuilderMock = {
  select: jest.Mock;
  distinctOn: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getRawMany: jest.Mock;
};

function makeTeam(name: string, id = `team-${name}`): TeamEntity {
  return { id, name } as TeamEntity;
}

function makeFanzone(overrides: Partial<FanzoneEntity> = {}): FanzoneEntity {
  return {
    id: NEAR_ZONE_ID,
    name: 'Bab Bhar Fan Zone',
    description: 'Central square with a large screen.',
    city: 'Tunis',
    address: '1 Avenue Habib Bourguiba',
    capacity: 1000,
    availableSpots: 400,
    openingHour: '18:00:00',
    closingHour: '00:00:00',
    teams: [makeTeam('Tunisia')],
    ...overrides,
  } as FanzoneEntity;
}

function makeCandidateZone(
  distance: number,
  overrides: Partial<FanzoneEntity> = {},
): FanzoneWithDistance {
  const zone = makeFanzone(overrides) as FanzoneWithDistance;
  zone.distance = distance;
  return zone;
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: 'fan@example.com',
    favoriteTeams: [makeTeam('Tunisia')],
    preferences: {
      city: 'Tunis',
      favoriteAmbiance: AmbiancePreference.SUPPORTERS,
    },
    ...overrides,
  } as UserEntity;
}

function makeMatch(overrides: Partial<MatchEntity> = {}): MatchEntity {
  return {
    id: MATCH_ID,
    matchDate: MATCH_DATE,
    stadium: 'Stade de Rades',
    status: MatchStatus.SCHEDULED,
    homeTeam: makeTeam('Tunisia'),
    awayTeam: makeTeam('France'),
    ...overrides,
  } as MatchEntity;
}

function makeAiOutput(
  overrides: Partial<AiRecommendationOutputDto> = {},
): AiRecommendationOutputDto {
  return {
    fanzoneId: NEAR_ZONE_ID,
    explanation:
      'Closest zone to you, showing Tunisia, and still with room to spare.',
    score: 0.87,
    matchesTeamPreference: true,
    distanceFromUser: '3.2 km away',
    crowdLevel: '60% occupied',
    ambianceMatch: 'Supporters atmosphere',
    ...overrides,
  };
}

function makeRecommendation(
  overrides: Partial<RecommendationEntity> = {},
): RecommendationEntity {
  return {
    id: RECOMMENDATION_ID,
    userId: USER_ID,
    matchId: MATCH_ID,
    recommendedFanZoneId: NEAR_ZONE_ID,
    explanation: 'A stored explanation that comfortably clears the floor.',
    // `pg` hands `numeric` back as a string — the mapper must coerce it.
    score: '0.87' as unknown as number,
    createdAt: CREATED_AT,
    user: makeUser(),
    match: makeMatch(),
    recommendedFanZone: makeFanzone(),
    ...overrides,
  };
}

describe('RecommendationService', () => {
  let service: RecommendationService;
  let recommendationRepo: RepoMock<RecommendationEntity> & {
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let userRepo: RepoMock<UserEntity>;
  let matchRepo: RepoMock<MatchEntity>;
  let alertRepo: RepoMock<AlertEntity>;
  let fanzoneService: jest.Mocked<
    Pick<FanzoneService, 'findWithDistanceFrom' | 'getCrowdStatusMany'>
  >;
  let aiService: jest.Mocked<Pick<AiService, 'generateRecommendation'>>;
  let queryBuilder: QueryBuilderMock;

  /** Occupancy snapshots keyed by fan zone id, as FanzoneService returns them. */
  function crowdMap(entries: Record<string, number>) {
    return new Map(
      Object.entries(entries).map(([id, occupancyPercentage]) => [
        id,
        { totalPresent: 0, byTeam: [], occupancyPercentage },
      ]),
    );
  }

  beforeEach(async () => {
    queryBuilder = {
      select: jest.fn(),
      distinctOn: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    for (const key of [
      'select',
      'distinctOn',
      'where',
      'orderBy',
      'addOrderBy',
    ] as const) {
      queryBuilder[key].mockReturnValue(queryBuilder);
    }

    recommendationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((input: Partial<RecommendationEntity>) => input),
      save: jest.fn((input: Partial<RecommendationEntity>) => ({
        ...input,
        id: RECOMMENDATION_ID,
        createdAt: CREATED_AT,
      })),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };

    userRepo = { findOne: jest.fn().mockResolvedValue(makeUser()) };
    matchRepo = { findOne: jest.fn().mockResolvedValue(makeMatch()) };
    alertRepo = { findOne: jest.fn().mockResolvedValue(null) };

    fanzoneService = {
      findWithDistanceFrom: jest
        .fn()
        .mockResolvedValue([makeCandidateZone(3.2)]),
      getCrowdStatusMany: jest
        .fn()
        .mockResolvedValue(crowdMap({ [NEAR_ZONE_ID]: 60 })),
    };

    aiService = {
      generateRecommendation: jest.fn().mockResolvedValue(makeAiOutput()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationService,
        {
          provide: getRepositoryToken(RecommendationEntity),
          useValue: recommendationRepo,
        },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(MatchEntity), useValue: matchRepo },
        { provide: getRepositoryToken(AlertEntity), useValue: alertRepo },
        { provide: FanzoneService, useValue: fanzoneService },
        { provide: AiService, useValue: aiService },
      ],
    }).compile();

    service = module.get<RecommendationService>(RecommendationService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateRecommendation (EF-13, EF-14, ENF-01)', () => {
    it('returns a fully populated recommendation for a valid user and match', async () => {
      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(result.recommendedFanzoneId).toBe(NEAR_ZONE_ID);
      expect(result.recommendedFanzoneName).toBe('Bab Bhar Fan Zone');
      expect(result.recommendation.explanation).toBe(
        makeAiOutput().explanation,
      );
      expect(result.recommendation.score).toBe(0.87);
      expect(result.recommendation.matchInfo).toEqual({
        homeTeam: 'Tunisia',
        awayTeam: 'France',
        matchDate: MATCH_DATE.toISOString(),
        stadium: 'Stade de Rades',
      });
      expect(result.recommendation.fanzoneInfo.distance).toBe(3.2);
      expect(result.recommendation.fanzoneInfo.occupancyPercentage).toBe(60);
      expect(result.recommendation.fanzoneInfo.teamsSupported).toEqual([
        'Tunisia',
      ]);
    });

    it('persists the recommendation under the entity spelling of the fan zone column', async () => {
      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(recommendationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          matchId: MATCH_ID,
          recommendedFanZoneId: NEAR_ZONE_ID,
          score: 0.87,
        }),
      );
      expect(recommendationRepo.save).toHaveBeenCalledTimes(1);
    });

    it('normalises the Postgres HH:mm:ss time columns to the HH:mm the contract promises', async () => {
      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(result.recommendation.fanzoneInfo.openingHour).toBe('18:00');
      expect(result.recommendation.fanzoneInfo.closingHour).toBe('00:00');
    });

    it('serves a recommendation younger than the TTL without calling the AI', async () => {
      recommendationRepo.findOne.mockResolvedValueOnce(makeRecommendation());
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(3.2),
      ]);

      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(aiService.generateRecommendation).not.toHaveBeenCalled();
      expect(result.id).toBe(RECOMMENDATION_ID);
      // Stored as the string "0.87"; the contract is a number.
      expect(result.recommendation.score).toBe(0.87);
    });

    it('regenerates when no recommendation is inside the TTL window', async () => {
      // `findFreshRecommendation` bounds its own query, so a miss is a null.
      recommendationRepo.findOne.mockResolvedValue(null);

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(aiService.generateRecommendation).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.generateRecommendation(USER_ID, MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the match does not exist', async () => {
      matchRepo.findOne.mockResolvedValue(null);

      await expect(
        service.generateRecommendation(USER_ID, MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when no fan zone can be located at all', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([]);

      await expect(
        service.generateRecommendation(USER_ID, MATCH_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(aiService.generateRecommendation).not.toHaveBeenCalled();
    });

    it('measures distance from the city on the user profile', async () => {
      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(fanzoneService.findWithDistanceFrom).toHaveBeenCalledWith(
        CITY_COORDINATES.tunis.latitude,
        CITY_COORDINATES.tunis.longitude,
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('falls back to the default city and warns when the preference city is unknown', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      userRepo.findOne.mockResolvedValue(
        makeUser({
          preferences: {
            city: 'Atlantis',
            favoriteAmbiance: AmbiancePreference.CALM,
          },
        } as Partial<UserEntity>),
      );

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(fanzoneService.findWithDistanceFrom).toHaveBeenCalledWith(
        CITY_COORDINATES.tunis.latitude,
        CITY_COORDINATES.tunis.longitude,
        expect.anything(),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Atlantis'));
    });

    it('matches an accented, differently cased city against the table', async () => {
      userRepo.findOne.mockResolvedValue(
        makeUser({
          preferences: {
            city: ' BÉJA ',
            favoriteAmbiance: AmbiancePreference.CALM,
          },
        } as Partial<UserEntity>),
      );

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(fanzoneService.findWithDistanceFrom).toHaveBeenCalledWith(
        CITY_COORDINATES.beja.latitude,
        CITY_COORDINATES.beja.longitude,
        expect.anything(),
      );
    });
  });

  describe('candidate filtering and relaxation (EF-13)', () => {
    /** Reads the candidate ids that actually reached the prompt. */
    function promptedIds(): string[] {
      const [params] = aiService.generateRecommendation.mock.calls[0] as [
        { candidates: { id: string }[] },
      ];
      return params.candidates.map((candidate) => candidate.id);
    }

    it('keeps only zones that broadcast a match team, are open and have room', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(1, {
          id: FAR_ZONE_ID,
          teams: [makeTeam('Brazil')],
        }),
        makeCandidateZone(3.2),
      ]);
      fanzoneService.getCrowdStatusMany.mockResolvedValue(
        crowdMap({ [FAR_ZONE_ID]: 10, [NEAR_ZONE_ID]: 60 }),
      );

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(promptedIds()).toEqual([NEAR_ZONE_ID]);
    });

    it('drops the team-broadcast rule rather than failing when no zone shows the match', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(1, { teams: [makeTeam('Brazil')] }),
      ]);
      aiService.generateRecommendation.mockResolvedValue(makeAiOutput());

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(promptedIds()).toEqual([NEAR_ZONE_ID]);
    });

    it('tells the model when the team-broadcast rule was dropped', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(1, { teams: [makeTeam('Brazil')] }),
      ]);

      await service.generateRecommendation(USER_ID, MATCH_ID);

      const [params] = aiService.generateRecommendation.mock.calls[0] as [
        { candidates: { description: string | null }[] },
      ];
      expect(params.candidates[0].description).toContain('may not broadcast');
    });

    it('drops the capacity rule rather than failing when every zone is full', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(3.2, { availableSpots: 0 }),
      ]);

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(promptedIds()).toEqual([NEAR_ZONE_ID]);
    });

    it('treats a zone with no opening hours as open', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(3.2, {
          openingHour: null as unknown as string,
          closingHour: null as unknown as string,
        }),
      ]);

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(promptedIds()).toEqual([NEAR_ZONE_ID]);
    });

    it('treats a window wrapping past midnight as open at a 19:00 kick-off', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(3.2, {
          openingHour: '18:00:00',
          closingHour: '02:00:00',
        }),
      ]);

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(promptedIds()).toEqual([NEAR_ZONE_ID]);
    });

    it('excludes a zone closed at kick-off while another qualifies', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(1, {
          id: FAR_ZONE_ID,
          openingHour: '09:00:00',
          closingHour: '17:00:00',
        }),
        makeCandidateZone(3.2),
      ]);
      fanzoneService.getCrowdStatusMany.mockResolvedValue(
        crowdMap({ [FAR_ZONE_ID]: 10, [NEAR_ZONE_ID]: 60 }),
      );

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(promptedIds()).toEqual([NEAR_ZONE_ID]);
    });
  });

  describe('fallback when the AI is unavailable (EF-13, ENF-01)', () => {
    const kinds = [
      'auth',
      'rate_limit',
      'timeout',
      'network',
      'overloaded',
      'invalid_response',
    ] as const;

    it.each(kinds)(
      'recommends the nearest zone rather than failing on a "%s" error',
      async (kind) => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        aiService.generateRecommendation.mockRejectedValue(
          new AiServiceError(kind, 'boom'),
        );
        fanzoneService.findWithDistanceFrom.mockResolvedValue([
          makeCandidateZone(3.2),
          makeCandidateZone(120, { id: FAR_ZONE_ID }),
        ]);
        fanzoneService.getCrowdStatusMany.mockResolvedValue(
          crowdMap({ [NEAR_ZONE_ID]: 60, [FAR_ZONE_ID]: 10 }),
        );

        const result = await service.generateRecommendation(USER_ID, MATCH_ID);

        expect(result.recommendedFanzoneId).toBe(NEAR_ZONE_ID);
        expect(result.recommendation.score).toBe(FALLBACK_SCORE);
        expect(result.recommendation.explanation).toBe(FALLBACK_EXPLANATION);
      },
    );

    it('logs an auth failure at error level, since only an operator can fix it', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      aiService.generateRecommendation.mockRejectedValue(
        new AiServiceError('auth', 'bad key'),
      );

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(error).toHaveBeenCalledWith(expect.stringContaining('kind=auth'));
    });

    it('logs a timeout at warn level, since it is expected background noise', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      aiService.generateRecommendation.mockRejectedValue(
        new AiServiceError('timeout', 'too slow'),
      );

      await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('kind=timeout'),
      );
      expect(error).not.toHaveBeenCalled();
    });

    it('produces a fallback that satisfies the AI response contract', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      aiService.generateRecommendation.mockRejectedValue(
        new AiServiceError('timeout', 'too slow'),
      );

      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      // The guard that matters: the explanation the spec originally proposed was
      // 47 characters and would have failed this very validator.
      const asAiOutput = plainToInstance(AiRecommendationOutputDto, {
        fanzoneId: result.recommendedFanzoneId,
        explanation: result.recommendation.explanation,
        score: result.recommendation.score,
        ...result.recommendation.reasoning,
      });

      expect(validateSync(asAiOutput)).toEqual([]);
    });

    it('reports a true team preference in the fallback rather than a blanket false', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      aiService.generateRecommendation.mockRejectedValue(
        new AiServiceError('network', 'unreachable'),
      );

      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(result.recommendation.reasoning.matchesTeamPreference).toBe(true);
    });
  });

  describe('derived reasoning (EF-14)', () => {
    it('derives the chips from live figures rather than from the model reply', async () => {
      aiService.generateRecommendation.mockResolvedValue(
        makeAiOutput({
          distanceFromUser: '999 km away',
          crowdLevel: 'empty',
          ambianceMatch: 'whatever the model felt like',
        }),
      );

      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(result.recommendation.reasoning.distanceFromUser).toBe(
        '3.2 km away',
      );
      expect(result.recommendation.reasoning.crowdLevel).toBe('60% occupied');
      expect(result.recommendation.reasoning.ambianceMatch).toBe(
        'Supporters atmosphere',
      );
    });

    it('reports a busy zone as a poor fit for a calm preference', async () => {
      userRepo.findOne.mockResolvedValue(
        makeUser({
          preferences: {
            city: 'Tunis',
            favoriteAmbiance: AmbiancePreference.CALM,
          },
        } as Partial<UserEntity>),
      );

      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(result.recommendation.reasoning.ambianceMatch).toBe(
        'Busier than your calm preference',
      );
    });

    it('reports no team match when the zone shows neither favourite', async () => {
      fanzoneService.findWithDistanceFrom.mockResolvedValue([
        makeCandidateZone(3.2, { teams: [makeTeam('France')] }),
      ]);

      const result = await service.generateRecommendation(USER_ID, MATCH_ID);

      expect(result.recommendation.reasoning.matchesTeamPreference).toBe(false);
    });
  });

  describe('getRecommendation', () => {
    it('maps the newest stored recommendation', async () => {
      recommendationRepo.findOne.mockResolvedValue(makeRecommendation());

      const result = await service.getRecommendation(USER_ID, MATCH_ID);

      expect(result?.id).toBe(RECOMMENDATION_ID);
      expect(result?.createdAt).toBe(CREATED_AT.toISOString());
      expect(recommendationRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });

    it('returns null when the user has no recommendation for the match', async () => {
      recommendationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getRecommendation(USER_ID, MATCH_ID),
      ).resolves.toBeNull();
    });
  });

  describe('getRecommendationsForMatch', () => {
    it('orders by score in SQL, because pg returns numeric as a string', async () => {
      recommendationRepo.find.mockResolvedValue([makeRecommendation()]);

      await service.getRecommendationsForMatch(MATCH_ID);

      expect(recommendationRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { matchId: MATCH_ID },
          order: { score: 'DESC', createdAt: 'DESC' },
        }),
      );
    });

    it('returns an empty list when the match has no recommendations', async () => {
      recommendationRepo.find.mockResolvedValue([]);

      await expect(
        service.getRecommendationsForMatch(MATCH_ID),
      ).resolves.toEqual({ recommendations: [] });
    });
  });

  describe('getUserRecommendations', () => {
    it('collapses to one row per match and caps the history', async () => {
      const rows = Array.from({ length: 25 }, (_, index) => ({
        id: `rec-${index}`,
      }));
      queryBuilder.getRawMany.mockResolvedValue(rows);
      recommendationRepo.find.mockResolvedValue(
        rows.map((row, index) =>
          makeRecommendation({
            id: row.id,
            createdAt: new Date(CREATED_AT.getTime() - index * 60_000),
          }),
        ),
      );

      const result = await service.getUserRecommendations(USER_ID);

      expect(queryBuilder.distinctOn).toHaveBeenCalledWith([
        'recommendation.matchId',
      ]);
      expect(result.recommendations).toHaveLength(USER_HISTORY_LIMIT);
      // Newest first, despite the DISTINCT ON query ordering by match id.
      expect(result.recommendations[0].id).toBe('rec-0');
    });

    it('returns an empty list without a second query when the fan has none', async () => {
      queryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getUserRecommendations(USER_ID);

      expect(result).toEqual({ recommendations: [] });
      expect(recommendationRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('suggestAlerts (EF-15)', () => {
    const NOW = new Date('2026-06-15T12:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /** Kick-off `days` from the frozen clock. */
    function matchIn(days: number): MatchEntity {
      return makeMatch({
        matchDate: new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000),
      });
    }

    it('offers only the lead times that have not already passed', async () => {
      matchRepo.findOne.mockResolvedValue(matchIn(3));

      const [suggestion] = await service.suggestAlerts(USER_ID, MATCH_ID);

      // "7 days before" would already be two days in the past.
      expect(
        suggestion.suggestedTriggerTimes.map((time) => time.label),
      ).toEqual(['24 hours before', '1 hour before', '30 minutes before']);
    });

    it('carries an absolute trigger instant alongside the offset', async () => {
      matchRepo.findOne.mockResolvedValue(matchIn(3));

      const [suggestion] = await service.suggestAlerts(USER_ID, MATCH_ID);
      const [first] = suggestion.suggestedTriggerTimes;

      expect(first.offsetSeconds).toBe(86400);
      expect(first.triggerTime).toBe(
        new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      );
    });

    it('names the favourite team that is playing', async () => {
      matchRepo.findOne.mockResolvedValue(matchIn(3));

      const [suggestion] = await service.suggestAlerts(USER_ID, MATCH_ID);

      expect(suggestion.teamName).toBe('Tunisia');
    });

    it('suggests nothing when neither side is a favourite', async () => {
      matchRepo.findOne.mockResolvedValue(
        makeMatch({
          matchDate: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
          homeTeam: makeTeam('Brazil'),
          awayTeam: makeTeam('Argentina'),
        }),
      );

      await expect(service.suggestAlerts(USER_ID, MATCH_ID)).resolves.toEqual(
        [],
      );
    });

    it('suggests nothing for a match beyond the seven-day window', async () => {
      matchRepo.findOne.mockResolvedValue(matchIn(10));

      await expect(service.suggestAlerts(USER_ID, MATCH_ID)).resolves.toEqual(
        [],
      );
    });

    it('suggests nothing for a match that has already kicked off', async () => {
      matchRepo.findOne.mockResolvedValue(matchIn(-1));

      await expect(service.suggestAlerts(USER_ID, MATCH_ID)).resolves.toEqual(
        [],
      );
    });

    it('suggests nothing when the fan already has an alert for the match', async () => {
      matchRepo.findOne.mockResolvedValue(matchIn(3));
      alertRepo.findOne.mockResolvedValue({ id: 'alert-uuid' } as AlertEntity);

      await expect(service.suggestAlerts(USER_ID, MATCH_ID)).resolves.toEqual(
        [],
      );
    });

    it('throws NotFoundException for an unknown match', async () => {
      matchRepo.findOne.mockResolvedValue(null);

      await expect(
        service.suggestAlerts(USER_ID, MATCH_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
