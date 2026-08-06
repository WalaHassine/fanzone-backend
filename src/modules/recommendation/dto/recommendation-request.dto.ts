import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Request body for asking the AI for a fan zone recommendation.
 *
 * Requirement: EF-13 — recommend a fan zone matching the user's profile.
 * Requirement: ENF-01 — the recommendation must be produced in under 3 seconds.
 *
 * The DTO carries a single field on purpose. Everything the recommender needs
 * about *who* is asking — favourite teams, preferred city, ambiance preference,
 * check-in history — is read server-side from `UserEntity` and its eager
 * `preferences` / `favoriteTeams` relations, keyed by the id on the verified
 * JWT. Accepting any of that from the body would let a caller both impersonate
 * another profile and skew their own recommendation.
 *
 * Two rules deliberately live outside this DTO:
 * - **Match existence** is checked by `RecommendationService`, which resolves
 *   the match and throws `NotFoundException` when it is unknown.
 *   class-validator has no database access, and this project registers no async
 *   validators.
 * - **`userId`** is never declared. It comes from `@CurrentUser`, exactly as in
 *   the check-in DTOs (ENF-05). The global pipe runs with `whitelist` +
 *   `forbidNonWhitelisted`, so a body-supplied `userId` is rejected outright
 *   rather than quietly dropped — asserted in recommendation-dto.spec.ts.
 */
export class RecommendationRequestDto {
  @ApiProperty({
    description: 'UUID of the match to recommend a fan zone for',
    example: 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70',
    format: 'uuid',
  })
  @IsUUID('all', { message: 'matchId must be a valid UUID' })
  matchId!: string;
}
