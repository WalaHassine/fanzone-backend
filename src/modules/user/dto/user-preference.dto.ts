import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { AmbiancePreference } from '../entities/user-preference.entity';

/**
 * Upper bound for the city name, mirroring the `varchar(255)` column on
 * UserPreferenceEntity so validation rejects what the database could not store.
 */
export const CITY_MAX_LENGTH = 255;

/**
 * A user's fan-zone preferences.
 *
 * Requirement: EF-04 — "Définir sa ville / localisation".
 * Requirement: EF-05 — "Choisir une préférence d'ambiance".
 *
 * Both fields are required here; the partial counterpart is
 * UpdateUserPreferenceDto.
 */
export class UserPreferenceDto {
  @ApiProperty({
    description: 'City the user watches matches in',
    example: 'Doha',
    maxLength: CITY_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(CITY_MAX_LENGTH, {
    message: `City must be at most ${CITY_MAX_LENGTH} characters long`,
  })
  city!: string;

  @ApiProperty({
    description: 'Preferred fan-zone atmosphere',
    enum: AmbiancePreference,
    enumName: 'AmbiancePreference',
    example: AmbiancePreference.ANIMATED,
  })
  @IsEnum(AmbiancePreference, {
    message: 'Ambiance must be one of: CALM, FAMILY, ANIMATED, SUPPORTERS',
  })
  @IsNotEmpty({ message: 'Ambiance preference is required' })
  favoriteAmbiance!: AmbiancePreference;
}
