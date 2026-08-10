import { AmbiancePreference } from '../../user/entities/user-preference.entity';

/**
 * Inputs to `AiService`.
 *
 * Plain types, no `class-validator` decorators: these never cross an HTTP
 * boundary, so the global ValidationPipe would never run on them and decorators
 * here would be dead weight. The one shape in this module that *is* validated is
 * `AiRecommendationOutputDto`, because the model — not the caller — is the
 * untrusted input.
 *
 * The caller assembles all of this; `AiService` does no database work.
 */

/** The requesting user, flattened out of UserEntity + UserPreferenceEntity. */
export type AiUserProfile = {
  email: string;
  favoriteTeams: string[];
  /** Null when the user has no preferences row yet. */
  preferredAmbiance: AmbiancePreference | null;
  latitude: number;
  longitude: number;
};

/** The match the recommendation is for. */
export type AiMatchContext = {
  homeTeam: string;
  awayTeam: string;
  matchDate: Date;
  stadium: string;
};

/**
 * One fan zone the model may choose from.
 *
 * `distanceKm` is not stored on the entity — the caller computes it with
 * `FanzoneService.distanceKmExpression()` (`ST_Distance(...::geography)/1000`)
 * and passes it in. `occupancyPercentage` is
 * `Math.round(((capacity - availableSpots) / capacity) * 100)`, guarding
 * `capacity === 0`.
 *
 * There is no ambiance field, because `FanzoneEntity` has no ambiance column.
 */
export type AiFanzoneCandidate = {
  id: string;
  name: string;
  city: string;
  distanceKm: number;
  occupancyPercentage: number;
  /** `FanzoneEntity.teams` mapped to `.name`. */
  teamsSupported: string[];
  description: string | null;
};

export type GenerateRecommendationParams = {
  userProfile: AiUserProfile;
  match: AiMatchContext;
  candidates: AiFanzoneCandidate[];
};

/** Input to `generateFanzoneDescription` (EF-21). */
export type GenerateDescriptionParams = {
  name: string;
  city: string;
  capacity: number;
  teamsSupported: string[];
};
