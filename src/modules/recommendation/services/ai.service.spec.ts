import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APIConnectionError, APIConnectionTimeoutError } from 'groq-sdk';

import { AiService } from './ai.service';
import { AiServiceError } from './ai.errors';
import { AmbiancePreference } from '../../user/entities/user-preference.entity';
import { AiFanzoneCandidate, GenerateRecommendationParams } from './ai.types';

const mockCreate = jest.fn();

/**
 * `groq-sdk` is replaced by a single `create` spy, but the real error classes
 * are kept: `mapGroqError` narrows on `instanceof`, and an auto-mocked class
 * would make every one of those checks silently false.
 */
jest.mock('groq-sdk', () => {
  const actual = jest.requireActual<typeof import('groq-sdk')>('groq-sdk');
  const GroqMock = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));

  return {
    __esModule: true,
    default: GroqMock,
    Groq: GroqMock,
    APIConnectionError: actual.APIConnectionError,
    APIConnectionTimeoutError: actual.APIConnectionTimeoutError,
  };
});

const TUNIS_ZONE_ID = '3f1b7c2a-5d4e-4a91-8b2f-6c1d9e0a7b31';
const SOUSSE_ZONE_ID = '9c8d7e6f-1a2b-4c3d-9e8f-7a6b5c4d3e2f';
const UNOFFERED_ZONE_ID = '00000000-0000-4000-8000-000000000000';

const API_KEY = 'gsk_test_secret_key';
const MODEL = 'llama-3.3-70b-versatile';

/** Exactly 50 characters at the floor `EXPLANATION_MIN_LENGTH` enforces. */
const VALID_EXPLANATION = 'Bab Bhar is the closest zone and backs Tunisia too.';

function makeCandidate(
  overrides: Partial<AiFanzoneCandidate> = {},
): AiFanzoneCandidate {
  return {
    id: TUNIS_ZONE_ID,
    name: 'Bab Bhar Fan Zone',
    city: 'Tunis',
    distanceKm: 3.2,
    occupancyPercentage: 60,
    teamsSupported: ['Tunisia'],
    description: 'Central square with a large screen.',
    ...overrides,
  };
}

function makeParams(
  overrides: Partial<GenerateRecommendationParams> = {},
): GenerateRecommendationParams {
  return {
    userProfile: {
      email: 'fan@example.com',
      favoriteTeams: ['Tunisia'],
      preferredAmbiance: AmbiancePreference.SUPPORTERS,
      latitude: 36.8065,
      longitude: 10.1815,
    },
    match: {
      homeTeam: 'Tunisia',
      awayTeam: 'France',
      matchDate: new Date('2026-06-18T18:00:00.000Z'),
      stadium: 'Stade de Rades',
    },
    candidates: [
      makeCandidate(),
      makeCandidate({
        id: SOUSSE_ZONE_ID,
        name: 'Sousse Beach Zone',
        city: 'Sousse',
        distanceKm: 140.5,
        occupancyPercentage: 20,
      }),
    ],
    ...overrides,
  };
}

/** A well-formed model reply, before any per-test mutation. */
function makeReply(overrides: Record<string, unknown> = {}) {
  return {
    fanzoneId: TUNIS_ZONE_ID,
    explanation: VALID_EXPLANATION,
    score: 0.87,
    matchesTeamPreference: true,
    distanceFromUser: '3.2 km away',
    crowdLevel: 'moderately busy at 60%',
    ambianceMatch: 'loud supporters crowd, matching your preference',
    ...overrides,
  };
}

/** Wraps `content` in the chat-completion envelope the SDK returns. */
function completionWith(content: string) {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
  };
}

/** Runs `generateRecommendation` and returns the thrown AiServiceError. */
async function captureError(
  service: AiService,
  params = makeParams(),
): Promise<AiServiceError> {
  try {
    await service.generateRecommendation(params);
  } catch (error) {
    return error as AiServiceError;
  }

  throw new Error('Expected generateRecommendation to throw, but it resolved');
}

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    mockCreate.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => ({
              groqApiKey: API_KEY,
              groqModel: MODEL,
              groqTimeoutMs: 3000,
            })),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateRecommendation (EF-13, EF-14, ENF-01)', () => {
    it('returns a validated DTO for a well-formed reply', async () => {
      mockCreate.mockResolvedValue(completionWith(JSON.stringify(makeReply())));

      const result = await service.generateRecommendation(makeParams());

      expect(result.fanzoneId).toBe(TUNIS_ZONE_ID);
      expect(result.score).toBe(0.87);
      expect(result.matchesTeamPreference).toBe(true);
      expect(result.explanation).toBe(VALID_EXPLANATION);
    });

    it('calls Groq with the configured model, a low temperature and JSON mode', async () => {
      mockCreate.mockResolvedValue(completionWith(JSON.stringify(makeReply())));

      await service.generateRecommendation(makeParams());

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: MODEL,
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
      );
    });

    it('lists every candidate id in the prompt so the model can only echo one back', async () => {
      mockCreate.mockResolvedValue(completionWith(JSON.stringify(makeReply())));

      await service.generateRecommendation(makeParams());

      const [request] = mockCreate.mock.calls[0] as [
        { messages: { role: string; content: string }[] },
      ];
      const prompt = request.messages[request.messages.length - 1].content;

      expect(prompt).toContain(TUNIS_ZONE_ID);
      expect(prompt).toContain(SOUSSE_ZONE_ID);
    });

    it('parses a reply wrapped in a markdown json fence', async () => {
      mockCreate.mockResolvedValue(
        completionWith('```json\n' + JSON.stringify(makeReply()) + '\n```'),
      );

      const result = await service.generateRecommendation(makeParams());

      expect(result.fanzoneId).toBe(TUNIS_ZONE_ID);
    });

    it('parses a reply with prose before and after the object', async () => {
      mockCreate.mockResolvedValue(
        completionWith(
          `Here is my pick!\n${JSON.stringify(makeReply())}\nHope that helps.`,
        ),
      );

      const result = await service.generateRecommendation(makeParams());

      expect(result.fanzoneId).toBe(TUNIS_ZONE_ID);
    });

    it('rejects a reply that is not parseable JSON', async () => {
      mockCreate.mockResolvedValue(completionWith('{ not json at all'));

      const error = await captureError(service);

      expect(error).toBeInstanceOf(AiServiceError);
      expect(error.kind).toBe('invalid_response');
    });

    it('rejects an explanation below the 50-character floor', async () => {
      mockCreate.mockResolvedValue(
        completionWith(JSON.stringify(makeReply({ explanation: 'Closest.' }))),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('invalid_response');
      expect(error.message).toContain('explanation');
    });

    it('rejects an explanation above the 500-character ceiling', async () => {
      mockCreate.mockResolvedValue(
        completionWith(
          JSON.stringify(makeReply({ explanation: 'a'.repeat(600) })),
        ),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('invalid_response');
      expect(error.message).toContain('explanation');
    });

    it('rejects a percentage-style score of 87, which would outrank every stored recommendation', async () => {
      mockCreate.mockResolvedValue(
        completionWith(JSON.stringify(makeReply({ score: 87 }))),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('invalid_response');
      expect(error.message).toContain('score');
    });

    it('rejects a stringified score instead of coercing it, proving implicit conversion is off', async () => {
      mockCreate.mockResolvedValue(
        completionWith(JSON.stringify(makeReply({ score: '0.9' }))),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('invalid_response');
      expect(error.message).toContain('score must be a number');
    });

    it('rejects "yes" for matchesTeamPreference instead of coercing it to true', async () => {
      mockCreate.mockResolvedValue(
        completionWith(
          JSON.stringify(makeReply({ matchesTeamPreference: 'yes' })),
        ),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('invalid_response');
      expect(error.message).toContain(
        'matchesTeamPreference must be a boolean',
      );
    });

    it('rejects a well-formed reply naming a fan zone that was never offered', async () => {
      mockCreate.mockResolvedValue(
        completionWith(
          JSON.stringify(makeReply({ fanzoneId: UNOFFERED_ZONE_ID })),
        ),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('invalid_response');
      expect(error.message).toContain('not among the candidates');
    });

    it('refuses an empty candidate list without spending a round trip', async () => {
      const error = await captureError(service, makeParams({ candidates: [] }));

      expect(error.kind).toBe('invalid_response');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it.each([
      [401, 'auth'],
      [429, 'rate_limit'],
      [503, 'overloaded'],
    ])('maps HTTP %i to kind "%s"', async (status, kind) => {
      mockCreate.mockRejectedValue(
        Object.assign(new Error('groq failed'), { status }),
      );

      const error = await captureError(service);

      expect(error.kind).toBe(kind);
    });

    it('maps an SDK connection timeout to kind "timeout"', async () => {
      mockCreate.mockRejectedValue(
        new APIConnectionTimeoutError({ message: 'Request timed out.' }),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('timeout');
    });

    it('maps an SDK connection failure to kind "network"', async () => {
      mockCreate.mockRejectedValue(
        new APIConnectionError({ message: 'Connection error.' }),
      );

      const error = await captureError(service);

      expect(error.kind).toBe('network');
    });

    it('never writes the API key, the prompt or the user email to the logs', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      mockCreate.mockResolvedValue(completionWith(JSON.stringify(makeReply())));
      await service.generateRecommendation(makeParams());

      mockCreate.mockRejectedValue(
        Object.assign(new Error('groq failed'), { status: 401 }),
      );
      await captureError(service);

      const logged = [log, warn, error]
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map((argument) => String(argument))
        .join(' | ');

      expect(logged).not.toContain(API_KEY);
      expect(logged).not.toContain('fan@example.com');
      expect(logged).not.toContain('Bab Bhar');
      expect(logged).toContain('status=401');
    });
  });

  describe('generateFanzoneDescription (EF-21)', () => {
    const fanzone = {
      name: 'Bab Bhar Fan Zone',
      city: 'Tunis',
      capacity: 1200,
      teamsSupported: ['Tunisia'],
    };

    it('returns the trimmed reply and caps the reply at 150 tokens', async () => {
      mockCreate.mockResolvedValue(
        completionWith('  A lively square in central Tunis.  '),
      );

      const result = await service.generateFanzoneDescription(fanzone);

      expect(result).toBe('A lively square in central Tunis.');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: MODEL, max_tokens: 150 }),
      );
    });

    it('asks for prose rather than JSON', async () => {
      mockCreate.mockResolvedValue(completionWith('A lively square.'));

      await service.generateFanzoneDescription(fanzone);

      const [request] = mockCreate.mock.calls[0] as [Record<string, unknown>];

      expect(request).not.toHaveProperty('response_format');
    });

    it('rejects an empty reply', async () => {
      mockCreate.mockResolvedValue(completionWith('   '));

      await expect(
        service.generateFanzoneDescription(fanzone),
      ).rejects.toMatchObject({ kind: 'invalid_response' });
    });
  });
});
