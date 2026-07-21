import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { AmbiancePreference } from '../entities/user-preference.entity';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';
import { CITY_MAX_LENGTH } from './user-preference.dto';

/**
 * Partial update of a user's fan-zone preferences.
 *
 * Requirement: EF-04 — "Définir sa ville / localisation".
 * Requirement: EF-05 — "Choisir une préférence d'ambiance".
 *
 * Every field is optional so a caller can change one without resending the
 * other, but `@AtLeastOneField` rejects an empty `{}` body — a no-op update is
 * almost always a client bug, not an intent.
 *
 * Deliberately NOT derived via `PartialType(UserPreferenceDto)`: writing the
 * fields out keeps the optionality, the length bound and the at-least-one rule
 * visible in one place rather than spread across a base class and a mixin.
 */
@AtLeastOneField(['city', 'favoriteAmbiance'], {
  message: 'At least one of city, favoriteAmbiance must be provided',
})
export class UpdateUserPreferenceDto {
  @ApiPropertyOptional({
    description: 'City the user watches matches in',
    example: 'Doha',
    maxLength: CITY_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CITY_MAX_LENGTH, {
    message: `City must be at most ${CITY_MAX_LENGTH} characters long`,
  })
  city?: string;

  @ApiPropertyOptional({
    description: 'Preferred fan-zone atmosphere',
    enum: AmbiancePreference,
    enumName: 'AmbiancePreference',
    example: AmbiancePreference.ANIMATED,
  })
  @IsOptional()
  @IsEnum(AmbiancePreference, {
    message: 'Ambiance must be one of: CALM, FAMILY, ANIMATED, SUPPORTERS',
  })
  favoriteAmbiance?: AmbiancePreference;
}
