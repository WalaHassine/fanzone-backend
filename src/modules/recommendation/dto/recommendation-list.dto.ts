import { ApiProperty } from '@nestjs/swagger';

import { RecommendationResponseDto } from './recommendation-response.dto';

/**
 * A fan's recommendations, highest confidence first.
 *
 * Requirement: EF-13 — recommend a fan zone matching the user's profile.
 *
 * Output DTO only. Wrapped in an object rather than returned as a bare array,
 * matching `UserCheckinsDto`: a top-level array cannot grow a sibling field
 * later without breaking every client.
 *
 * The ordering is part of the contract but cannot be expressed in the type —
 * the repository query must carry `ORDER BY score DESC`. Note that `score` is a
 * `numeric` column: ordering it in SQL is numeric and correct, but a JavaScript
 * sort applied after loading would compare the strings `pg` hands back and put
 * `"0.9"` below `"0.85"`. Sort in the query, not in the service.
 */
export class RecommendationListDto {
  @ApiProperty({
    description:
      'The recommendations, ordered by confidence score descending (highest first)',
    type: () => RecommendationResponseDto,
    isArray: true,
  })
  recommendations!: RecommendationResponseDto[];
}
