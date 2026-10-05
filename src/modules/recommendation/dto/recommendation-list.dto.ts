import { ApiProperty } from '@nestjs/swagger';

import { RecommendationResponseDto } from './recommendation-response.dto';

/**
 * A list of recommendations.
 *
 * Requirement: EF-13 — recommend a fan zone matching the user's profile.
 *
 * Output DTO only. Wrapped in an object rather than returned as a bare array,
 * matching `UserCheckinsDto`: a top-level array cannot grow a sibling field
 * later without breaking every client.
 *
 * **The ordering depends on the endpoint**, and the two are not the same:
 *
 * - `GET /recommendations/me` — **newest first**, one entry per match, capped at
 *   the 20 most recent. It is a history, so recency is what the fan is looking
 *   for, and a single match appearing three times would crowd out three others.
 * - `GET /recommendations/match/:matchId/all` (admin) — **highest score first**,
 *   ties broken by recency. It answers "which zone is this match's crowd being
 *   sent to, and how sure are we", where confidence is the useful axis.
 *
 * Neither order can be expressed in the type, so each query carries its own
 * `ORDER BY`. One trap worth keeping written down: `score` is a `numeric`
 * column, so ordering it in SQL is numeric and correct, but a JavaScript sort
 * applied after loading would compare the strings `pg` hands back and place
 * `"0.9"` below `"0.85"`. Sort by score in the query, never in the service.
 */
export class RecommendationListDto {
  @ApiProperty({
    description:
      'The recommendations. Order depends on the endpoint: newest first for ' +
      "the caller's history, highest confidence score first for a match's " +
      'admin listing.',
    type: () => RecommendationResponseDto,
    isArray: true,
  })
  recommendations!: RecommendationResponseDto[];
}
