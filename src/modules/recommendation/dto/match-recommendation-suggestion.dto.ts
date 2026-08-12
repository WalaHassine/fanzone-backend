import { ApiProperty } from '@nestjs/swagger';

import { SCORE_MAX, SCORE_MIN } from './ai-recommendation-output.dto';

/**
 * Not yet served by any endpoint — and that is on purpose.
 *
 * Both classes in this file are reserved for the planned "upcoming match nudge"
 * endpoint, which lists several candidate zones for a fixture at once. EF-15
 * turned out to be about alert *trigger times* rather than zone suggestions, so
 * `AlertSuggestionDto` was written for it and these were left standing rather
 * than deleted; the decision is recorded in
 * `docs/task-6.7-6.8-recommendation-plan.md`. They are exercised by
 * `recommendation-dto.spec.ts`, so the shape stays honest while it waits.
 *
 * If that endpoint is dropped, delete this file and its two barrel exports —
 * an unused DTO that no longer has a destination is just a shape to maintain.
 */

/**
 * One suggested fan zone within a match suggestion.
 *
 * Output DTO only. A deliberately thin projection: `reason` is a one-line
 * summary, not the full `explanation` of a stored recommendation, because a
 * suggestion lists several zones at once and the long form would bury the
 * comparison.
 */
export class SuggestedFanzoneDto {
  @ApiProperty({
    description: 'UUID of the suggested fan zone',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  fanzoneId!: string;

  @ApiProperty({
    description: 'Display name of the suggested fan zone',
    example: 'Doha Corniche Fan Zone',
  })
  fanzoneName!: string;

  @ApiProperty({
    description: 'Brief justification for suggesting this fan zone',
    example: 'Closest zone broadcasting Tunisia, and still under half full.',
  })
  reason!: string;

  @ApiProperty({
    description: 'Confidence in this suggestion, from 0 to 1',
    example: 0.87,
    minimum: SCORE_MIN,
    maximum: SCORE_MAX,
  })
  score!: number;
}

/**
 * Fan zone suggestions attached to an upcoming match.
 *
 * Requirement: EF-15 — suggest relevant alerts to the user.
 *
 * Output DTO only. This is the payload behind a proactive nudge ("Tunisia play
 * tomorrow — here is where to watch"), so unlike `RecommendationResponseDto` it
 * has no `id`: nothing is persisted to the `recommendations` table when a
 * suggestion is merely surfaced, and it offers several zones rather than
 * committing to one.
 *
 * The mapper must send `recommendedFanzones` down ordered by `score`
 * descending, for the reason spelled out in `RecommendationListDto`: sort in
 * SQL, since `pg` returns `numeric` as a string.
 */
export class MatchRecommendationSuggestionDto {
  @ApiProperty({
    description: 'UUID of the match the suggestions relate to',
    example: 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70',
    format: 'uuid',
  })
  matchId!: string;

  @ApiProperty({
    description: 'Name of the home team',
    example: 'Tunisia',
  })
  homeTeam!: string;

  @ApiProperty({
    description: 'Name of the away team',
    example: 'France',
  })
  awayTeam!: string;

  @ApiProperty({
    description: 'Kick-off time as an ISO 8601 datetime',
    example: '2026-06-18T19:00:00.000Z',
    format: 'date-time',
  })
  matchDate!: string;

  @ApiProperty({
    description: 'Stadium hosting the match',
    example: 'MetLife Stadium',
  })
  stadium!: string;

  @ApiProperty({
    description:
      'Suggested fan zones for this match, ordered by confidence score descending',
    type: () => SuggestedFanzoneDto,
    isArray: true,
  })
  recommendedFanzones!: SuggestedFanzoneDto[];
}
