import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Bounds on the AI-written explanation (EF-14).
 *
 * The `explanation` column is `text` (unbounded), so both ends are product
 * rules rather than storage ones: below the floor an "explanation" is a label
 * and not a justification, above the ceiling it stops fitting the card the
 * client renders it in.
 */
export const EXPLANATION_MIN_LENGTH = 50;
export const EXPLANATION_MAX_LENGTH = 500;

/**
 * Confidence bounds. `RecommendationEntity.score` is `numeric(3,2)`, which
 * stores at most `9.99` — the 0–1 range is the contract, and without these the
 * model could hand back a 0–100 style score that silently stores and then sorts
 * every other recommendation off the top of the list.
 */
export const SCORE_MIN = 0;
export const SCORE_MAX = 1;

/** Percentage bounds for the derived occupancy figure on the response DTO. */
export const OCCUPANCY_MIN = 0;
export const OCCUPANCY_MAX = 100;

/**
 * The model's reply, as parsed by `AiService`.
 *
 * Requirement: EF-14 — the recommendation carries a textual explanation.
 *
 * This is the **one** DTO in the module that carries validators, and it is
 * never bound to an HTTP request: the global `ValidationPipe` never sees it.
 * `AiService` is expected to `plainToInstance` the parsed JSON and run
 * `validateSync` itself, treating failures as a bad model response (retry or
 * fall back to a deterministic recommendation) rather than as a client error.
 *
 * Do that **without** `enableImplicitConversion`, unlike the global pipe. The
 * option exists to forgive query strings, and here it would forgive the model
 * instead: `"yes"` becomes `true` before `@IsBoolean` runs, and `"0.9"` becomes
 * `0.9` before `@IsNumber` does. A reply in the wrong shape should be caught,
 * not quietly repaired.
 *
 * Validating here rather than on `RecommendationResponseDto` is deliberate. An
 * LLM is the untrusted input in this flow — it can return a one-word
 * explanation, a score of 87, or a fan zone id it invented — whereas the
 * response DTOs are output-only and, per the convention documented in
 * `FanzoneResponseDto`, carry no validators at all. Decorators there would
 * never execute.
 *
 * `fanzoneId` must additionally be checked against the candidate set the prompt
 * offered; `@IsUUID` only proves the shape, not that the model refrained from
 * hallucinating a zone.
 */
export class AiRecommendationOutputDto {
  @IsUUID('all', { message: 'fanzoneId must be a valid UUID' })
  fanzoneId!: string;

  @IsString({ message: 'explanation must be a string' })
  @Length(EXPLANATION_MIN_LENGTH, EXPLANATION_MAX_LENGTH, {
    message: `explanation must be between ${EXPLANATION_MIN_LENGTH} and ${EXPLANATION_MAX_LENGTH} characters`,
  })
  explanation!: string;

  @IsNumber({}, { message: 'score must be a number' })
  @Min(SCORE_MIN, { message: `score must not be less than ${SCORE_MIN}` })
  @Max(SCORE_MAX, { message: `score must not be greater than ${SCORE_MAX}` })
  score!: number;

  @IsBoolean({ message: 'matchesTeamPreference must be a boolean' })
  matchesTeamPreference!: boolean;

  @IsString({ message: 'distanceFromUser must be a string' })
  @IsNotEmpty({ message: 'distanceFromUser must not be empty' })
  distanceFromUser!: string;

  @IsString({ message: 'crowdLevel must be a string' })
  @IsNotEmpty({ message: 'crowdLevel must not be empty' })
  crowdLevel!: string;

  @IsString({ message: 'ambianceMatch must be a string' })
  @IsNotEmpty({ message: 'ambianceMatch must not be empty' })
  ambianceMatch!: string;
}
