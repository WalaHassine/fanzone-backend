import { ApiProperty } from '@nestjs/swagger';

import {
  EXPLANATION_MAX_LENGTH,
  EXPLANATION_MIN_LENGTH,
  OCCUPANCY_MAX,
  OCCUPANCY_MIN,
  SCORE_MAX,
  SCORE_MIN,
} from './ai-recommendation-output.dto';

/**
 * The recommended fan zone, projected for the recommendation card.
 *
 * Requirement: EF-09 — distance, capacity, availability and broadcast teams.
 *
 * Output DTO only: it carries no validators, since it is never bound to an
 * incoming request. The bounds below are declared on `@ApiProperty` so the
 * published schema still states them; enforcement happens at the AI boundary
 * (`AiRecommendationOutputDto`) and in the service that derives the figures.
 *
 * Deliberately a narrower projection than `FanzoneResponseDto` — no
 * coordinates, no description, no PostGIS `location`. A client wanting the full
 * record already has `GET /fanzones/:id`; what belongs here is only what
 * justifies the recommendation.
 *
 * Mapper obligations, none of which the contract can enforce:
 * - `distance` is **not stored**. It is computed per request from the user's
 *   location against `FanzoneEntity.location`, and is meaningless without one.
 * - `occupancyPercentage` is derived:
 *   `Math.round(((capacity - availableSpots) / capacity) * 100)`, guarding
 *   `capacity === 0` so a misconfigured zone yields `0` rather than `NaN`.
 * - `openingHour`/`closingHour` are documented as `HH:mm`, but a Postgres
 *   `time` column returns `HH:mm:ss`. The mapper must normalise, e.g.
 *   `entity.openingHour?.slice(0, 5) ?? null`.
 * - `teamsSupported` carries team **names**, not ids — map
 *   `entity.teams.map((t) => t.name)`.
 */
export class RecommendedFanzoneInfoDto {
  @ApiProperty({
    description: 'Unique identifier of the fan zone',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Display name of the fan zone',
    example: 'Doha Corniche Fan Zone',
  })
  name!: string;

  @ApiProperty({
    description: 'City the fan zone is located in',
    example: 'Doha',
  })
  city!: string;

  @ApiProperty({
    description: 'Street address of the fan zone',
    example: 'Al Corniche Street, Doha',
  })
  address!: string;

  @ApiProperty({
    description:
      "Distance in kilometres from the requesting user's location, computed per request",
    example: 5.2,
    minimum: 0,
  })
  distance!: number;

  @ApiProperty({
    description: 'Maximum number of people the fan zone can host',
    example: 5000,
  })
  capacity!: number;

  @ApiProperty({
    description: 'Remaining places available right now',
    example: 3500,
  })
  availableSpots!: number;

  @ApiProperty({
    description:
      'Share of the capacity currently occupied, rounded to a whole percent',
    example: 30,
    minimum: OCCUPANCY_MIN,
    maximum: OCCUPANCY_MAX,
  })
  occupancyPercentage!: number;

  @ApiProperty({
    description: 'Names of the teams broadcast at this fan zone',
    type: [String],
    example: ['Tunisia', 'France'],
  })
  teamsSupported!: string[];

  @ApiProperty({
    description: 'Opening time in 24-hour HH:mm format, or null when unset',
    example: '18:00',
    type: String,
    nullable: true,
  })
  openingHour!: string | null;

  /**
   * May be earlier than `openingHour` — the pair describes a wrapping interval,
   * so a zone open past midnight reports e.g. `18:00` → `00:00`.
   */
  @ApiProperty({
    description:
      'Closing time in 24-hour HH:mm format, or null when unset; may be earlier than openingHour',
    example: '00:00',
    type: String,
    nullable: true,
  })
  closingHour!: string | null;
}

/**
 * The match the recommendation was made for.
 *
 * Output DTO only. Teams are carried by **name** rather than as
 * `TeamResponseDto`, because the recommendation card renders a fixture line
 * ("Tunisia vs France") and does not need the code or flag. The mapper reads
 * `entity.match.homeTeam.name` — `MatchEntity` loads both teams eagerly, so no
 * extra query is involved.
 */
export class RecommendationMatchInfoDto {
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
}

/**
 * The structured half of the justification.
 *
 * Requirement: EF-14 — the recommendation is explained to the user.
 *
 * Output DTO only. Complements `explanation`: the prose is what the fan reads,
 * these are the individual criteria the client can render as chips or check
 * marks without parsing the sentence. Every field but the first is
 * pre-formatted for display rather than numeric — a client that needs the raw
 * kilometres or percentage reads them off `fanzoneInfo`.
 */
export class RecommendationReasoningDto {
  @ApiProperty({
    description:
      'Whether the fan zone broadcasts one of the teams the user follows',
    example: true,
  })
  matchesTeamPreference!: boolean;

  @ApiProperty({
    description: 'Display-formatted distance from the user',
    example: '5.2 km away',
  })
  distanceFromUser!: string;

  @ApiProperty({
    description: 'Display-formatted occupancy of the fan zone',
    example: '30% occupied',
  })
  crowdLevel!: string;

  @ApiProperty({
    description:
      "How the zone's atmosphere lines up with the user's ambiance preference (see AmbiancePreference)",
    example: 'Supporters atmosphere',
  })
  ambianceMatch!: string;
}

/**
 * The recommendation itself: what was chosen, and why.
 *
 * Output DTO only.
 *
 * `score` lives here, alongside the explanation and reasoning it qualifies,
 * rather than at the top level of `RecommendationResponseDto` where the entity
 * column sits. It is the confidence *in this recommendation*, so it belongs
 * with the justification; the mapper reads `entity.score`, and moving the field
 * up a level later is a one-line change on both sides.
 */
export class RecommendationDetailDto {
  @ApiProperty({
    description: 'The recommended fan zone',
    type: () => RecommendedFanzoneInfoDto,
  })
  fanzoneInfo!: RecommendedFanzoneInfoDto;

  @ApiProperty({
    description:
      'Natural-language justification written by the AI, in the user-facing tone',
    example:
      'This fan zone is only 5.2 km from you, broadcasts Tunisia, and is currently 30% full — plenty of room left in a lively supporters section right before kick-off.',
    minLength: EXPLANATION_MIN_LENGTH,
    maxLength: EXPLANATION_MAX_LENGTH,
  })
  explanation!: string;

  @ApiProperty({
    description: 'The match this recommendation was made for',
    type: () => RecommendationMatchInfoDto,
  })
  matchInfo!: RecommendationMatchInfoDto;

  @ApiProperty({
    description: 'The individual criteria behind the recommendation',
    type: () => RecommendationReasoningDto,
  })
  reasoning!: RecommendationReasoningDto;

  @ApiProperty({
    description: 'Confidence in this recommendation, from 0 to 1',
    example: 0.87,
    minimum: SCORE_MIN,
    maximum: SCORE_MAX,
  })
  score!: number;
}

/**
 * A stored AI recommendation, as returned to the fan who asked for it.
 *
 * Requirement: EF-13 — recommend a fan zone matching the user's profile.
 * Requirement: EF-14 — provide a textual explanation.
 *
 * Output DTO only: it carries no validators, since it is never bound to an
 * incoming request. `userId` is deliberately absent — a fan only ever reads
 * their own recommendations, selected by the id on their JWT, so echoing the
 * identifier back adds nothing and would put it in a payload that need not
 * carry it.
 *
 * `recommendedFanzoneId` is spelled with a lower-case `z`, matching the
 * `Fanzone*` naming used across the API, while the column on
 * `RecommendationEntity` is `recommendedFanZoneId`. The mapper renames it; the
 * public contract does not inherit the entity's inconsistency.
 *
 * Mapper obligations the contract cannot enforce:
 * - `score` is a `numeric(3,2)` column and `pg` returns `numeric` as a
 *   **string**, with no transformer on the entity. The mapper must
 *   `Number(entity.score)`, or the field serialises as `"0.87"` and any
 *   client-side sort compares strings.
 * - `createdAt` is a `Date` on the entity → `.toISOString()`.
 */
export class RecommendationResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the stored recommendation',
    example: '8f14e45f-ceea-4d0b-9e3a-1c2d3e4f5a6b',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'UUID of the match the recommendation was made for',
    example: 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70',
    format: 'uuid',
  })
  matchId!: string;

  @ApiProperty({
    description: 'UUID of the recommended fan zone',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  recommendedFanzoneId!: string;

  /**
   * Duplicated from `recommendation.fanzoneInfo.name` on purpose: it lets a
   * list view render the headline without walking into the nested object.
   */
  @ApiProperty({
    description: 'Display name of the recommended fan zone',
    example: 'Doha Corniche Fan Zone',
  })
  recommendedFanzoneName!: string;

  @ApiProperty({
    description: 'The recommendation and the reasoning behind it',
    type: () => RecommendationDetailDto,
  })
  recommendation!: RecommendationDetailDto;

  @ApiProperty({
    description: 'When the recommendation was generated (ISO 8601)',
    example: '2026-06-18T17:42:00.000Z',
    format: 'date-time',
  })
  createdAt!: string;
}
