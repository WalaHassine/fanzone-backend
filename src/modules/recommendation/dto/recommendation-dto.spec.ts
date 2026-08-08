import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  AiRecommendationOutputDto,
  EXPLANATION_MAX_LENGTH,
  EXPLANATION_MIN_LENGTH,
} from './ai-recommendation-output.dto';
import {
  MatchRecommendationSuggestionDto,
  SuggestedFanzoneDto,
} from './match-recommendation-suggestion.dto';
import { RecommendationListDto } from './recommendation-list.dto';
import { RecommendationRequestDto } from './recommendation-request.dto';
import {
  RecommendationDetailDto,
  RecommendationMatchInfoDto,
  RecommendationReasoningDto,
  RecommendationResponseDto,
  RecommendedFanzoneInfoDto,
} from './recommendation-response.dto';

type Ctor<T> = new () => T;

/**
 * The global pipe from app.module.ts, reproduced option-for-option.
 *
 * Needed because `plainToInstance` alone does NOT drop undeclared properties —
 * it copies every key it is given. What actually stops a client supplying a
 * `userId` is this pipe's `whitelist` + `forbidNonWhitelisted` pair, so a test
 * about undeclared fields has to run the pipe or it proves nothing.
 */
const productionPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: false,
});

/** Runs a payload through the production pipe, as an incoming request body would. */
function throughPipe<T>(cls: Ctor<T>, payload: object): Promise<unknown> {
  return productionPipe.transform(payload, {
    type: 'body',
    metatype: cls as never,
  });
}

/**
 * The messages the production pipe would put in a 400 body, or `[]` if it
 * accepted the payload.
 */
async function pipeErrors<T>(cls: Ctor<T>, payload: object): Promise<string[]> {
  try {
    await throughPipe(cls, payload);
    return [];
  } catch (error) {
    const body = (error as BadRequestException).getResponse();
    const message = (body as { message?: string | string[] }).message ?? [];
    return Array.isArray(message) ? message : [message];
  }
}

/**
 * Mirrors the global ValidationPipe in app.module.ts, which runs with
 * `transformOptions: { enableImplicitConversion: true }`.
 *
 * Same helper as checkin-dto.spec.ts, and the option is deliberate for the same
 * reason: implicit conversion coerces a value into its declared type before
 * validation, so a spec without it asserts behaviour production does not have.
 */
function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload, {
    enableImplicitConversion: true,
  });
  return validateSync(instance).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

/**
 * Validation **without** implicit conversion, for `AiRecommendationOutputDto`.
 *
 * That DTO is never an HTTP body — it is the parsed model reply — so the global
 * pipe's coercion does not apply to it and must not be simulated here. The
 * difference is not cosmetic: with `enableImplicitConversion`, class-transformer
 * turns a model answering `"yes"` into `true` before `@IsBoolean` ever runs, and
 * a malformed reply would sail through. `AiService` is expected to call
 * `plainToInstance` with these same options.
 */
function strictErrorsFor<T extends object>(
  cls: Ctor<T>,
  payload: object,
): string[] {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const MATCH_ID = 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';

describe('RecommendationRequestDto (EF-13)', () => {
  it('accepts a valid payload', () => {
    expect(errorsFor(RecommendationRequestDto, { matchId: MATCH_ID })).toEqual(
      [],
    );
  });

  it('accepts an upper-case UUID', () => {
    // Postgres normalises `uuid` values and compares them case-insensitively,
    // so rejecting a case variant here would refuse a legitimate id.
    expect(
      errorsFor(RecommendationRequestDto, { matchId: MATCH_ID.toUpperCase() }),
    ).toEqual([]);
  });

  describe('matchId', () => {
    it('rejects a malformed UUID', () => {
      expect(
        errorsFor(RecommendationRequestDto, { matchId: 'not-a-uuid' }),
      ).toContain('matchId must be a valid UUID');
    });

    it('rejects a missing value', () => {
      expect(errorsFor(RecommendationRequestDto, {})).toContain(
        'matchId must be a valid UUID',
      );
    });

    it('rejects an empty string', () => {
      expect(errorsFor(RecommendationRequestDto, { matchId: '' })).toContain(
        'matchId must be a valid UUID',
      );
    });

    it('rejects a non-string', () => {
      expect(errorsFor(RecommendationRequestDto, { matchId: 12345 })).toContain(
        'matchId must be a valid UUID',
      );
    });
  });

  /**
   * The recommender reads the profile from the JWT-identified user, never from
   * the body, and never lets a caller pre-set the AI's own output. Asserted
   * through the production pipe, which rejects undeclared properties outright
   * rather than quietly dropping them.
   */
  describe('fields a client must not be able to supply', () => {
    it('passes a clean payload through with exactly the one declared field', async () => {
      const result = await throughPipe(RecommendationRequestDto, {
        matchId: MATCH_ID,
      });

      expect(Object.keys(result as object)).toEqual(['matchId']);
    });

    it('rejects a body-supplied userId', async () => {
      expect(
        await pipeErrors(RecommendationRequestDto, {
          matchId: MATCH_ID,
          userId: USER_ID,
        }),
      ).toContain('property userId should not exist');
    });

    it('rejects a body-supplied score', async () => {
      expect(
        await pipeErrors(RecommendationRequestDto, {
          matchId: MATCH_ID,
          score: 1,
        }),
      ).toContain('property score should not exist');
    });

    it('rejects a body-supplied fanzone preference', async () => {
      // Choosing the zone is the recommender's job — that is the whole feature.
      expect(
        await pipeErrors(RecommendationRequestDto, {
          matchId: MATCH_ID,
          recommendedFanzoneId: FANZONE_ID,
        }),
      ).toContain('property recommendedFanzoneId should not exist');
    });
  });
});

describe('AiRecommendationOutputDto (EF-14)', () => {
  /** A model reply that should pass, with per-test overrides. */
  const validOutput = (overrides: object = {}) => ({
    fanzoneId: FANZONE_ID,
    explanation:
      'This fan zone is only 5.2 km from you, broadcasts Tunisia, and is currently 30% full — plenty of room left before kick-off.',
    score: 0.87,
    matchesTeamPreference: true,
    distanceFromUser: '5.2 km away',
    crowdLevel: '30% occupied',
    ambianceMatch: 'Supporters atmosphere',
    ...overrides,
  });

  /** Validates a model reply the way `AiService` is expected to. */
  const check = (overrides: object = {}) =>
    strictErrorsFor(AiRecommendationOutputDto, validOutput(overrides));

  it('accepts a well-formed model reply', () => {
    expect(check()).toEqual([]);
  });

  const lengthMessage = `explanation must be between ${EXPLANATION_MIN_LENGTH} and ${EXPLANATION_MAX_LENGTH} characters`;

  describe('explanation', () => {
    it(`accepts exactly ${EXPLANATION_MIN_LENGTH} characters`, () => {
      expect(
        check({ explanation: 'a'.repeat(EXPLANATION_MIN_LENGTH) }),
      ).toEqual([]);
    });

    it(`accepts exactly ${EXPLANATION_MAX_LENGTH} characters`, () => {
      expect(
        check({ explanation: 'a'.repeat(EXPLANATION_MAX_LENGTH) }),
      ).toEqual([]);
    });

    it('rejects one character below the minimum', () => {
      expect(
        check({ explanation: 'a'.repeat(EXPLANATION_MIN_LENGTH - 1) }),
      ).toContain(lengthMessage);
    });

    it('rejects one character above the maximum', () => {
      expect(
        check({ explanation: 'a'.repeat(EXPLANATION_MAX_LENGTH + 1) }),
      ).toContain(lengthMessage);
    });

    it('rejects a missing explanation', () => {
      expect(check({ explanation: undefined })).toContain(
        'explanation must be a string',
      );
    });
  });

  describe('score', () => {
    it.each([0, 0.5, 1])('accepts %p', (score) => {
      expect(check({ score })).toEqual([]);
    });

    it('rejects a value below 0', () => {
      expect(check({ score: -0.1 })).toContain('score must not be less than 0');
    });

    it('rejects a value above 1', () => {
      // The failure mode this guards: a model answering on a 0-100 scale.
      expect(check({ score: 87 })).toContain(
        'score must not be greater than 1',
      );
    });

    it('rejects a score sent as a string', () => {
      // No implicit conversion here, deliberately — see strictErrorsFor.
      expect(check({ score: '0.9' })).toContain('score must be a number');
    });
  });

  describe('the remaining fields', () => {
    it('rejects a hallucinated fanzoneId that is not a UUID', () => {
      expect(check({ fanzoneId: 'Doha Corniche Fan Zone' })).toContain(
        'fanzoneId must be a valid UUID',
      );
    });

    it('rejects a non-boolean matchesTeamPreference', () => {
      // A model answering "yes" instead of true is caught here rather than
      // being coerced into a truthy value.
      expect(check({ matchesTeamPreference: 'yes' })).toContain(
        'matchesTeamPreference must be a boolean',
      );
    });

    it.each(['distanceFromUser', 'crowdLevel', 'ambianceMatch'])(
      'rejects an empty %s',
      (field) => {
        expect(check({ [field]: '' })).toContain(`${field} must not be empty`);
      },
    );
  });
});

/**
 * Locks in the module-wide convention: response DTOs are output-only and carry
 * no validators. If someone later decorates one, it would silently do nothing
 * in production — the global pipe only validates request bodies — while giving
 * the impression the shape is checked. This test fails first instead.
 *
 * `forbidUnknownValues: false` is required and is the whole subtlety. Its
 * default is `true`, under which validating a class class-validator holds *no*
 * metadata for yields the single error "an unknown value was passed to the
 * validate function" — which is the very state being asserted, so the default
 * would report a decorator-free DTO as failing. Turning it off makes an empty
 * result mean "nothing to validate", which is the claim.
 */
describe('response DTOs carry no validators', () => {
  const outputDtos: Array<[string, Ctor<object>]> = [
    ['RecommendationResponseDto', RecommendationResponseDto],
    ['RecommendationDetailDto', RecommendationDetailDto],
    ['RecommendedFanzoneInfoDto', RecommendedFanzoneInfoDto],
    ['RecommendationMatchInfoDto', RecommendationMatchInfoDto],
    ['RecommendationReasoningDto', RecommendationReasoningDto],
    ['RecommendationListDto', RecommendationListDto],
    ['MatchRecommendationSuggestionDto', MatchRecommendationSuggestionDto],
    ['SuggestedFanzoneDto', SuggestedFanzoneDto],
  ];

  it.each(outputDtos)('%s declares no validation rules', (_name, cls) => {
    const instance = plainToInstance(cls, {});
    expect(validateSync(instance, { forbidUnknownValues: false })).toEqual([]);
  });
});
