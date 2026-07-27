import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

/**
 * Upper bounds mirroring the `teams` columns on TeamEntity, so validation
 * rejects what the database could not store.
 */
export const TEAM_NAME_MAX_LENGTH = 255;
export const TEAM_CODE_LENGTH = 3;
export const TEAM_FLAG_MAX_LENGTH = 500;

/**
 * Team names are real-world names: Unicode letters plus space, hyphen,
 * apostrophe and period — so "Côte d'Ivoire" and "Bosnia-Herzegovina" pass,
 * while digits and symbols like `@#$%` are rejected.
 */
export const TEAM_NAME_PATTERN = /^[\p{L} .'-]+$/u;

/**
 * Exactly three uppercase alphanumeric characters, e.g. 'FRA'.
 * Input is uppercased before validation, so 'fra' is accepted.
 */
export const TEAM_CODE_PATTERN = /^[A-Z0-9]{3}$/;

/**
 * Request body for creating a team.
 *
 * Requirement: EF-06 — teams are the entities matches and favourites reference.
 *
 * That the name and code are not already taken is enforced by the service
 * layer, since class-validator has no database access.
 */
export class CreateTeamDto {
  @ApiProperty({
    description: 'Full name of the team',
    example: 'France',
    maxLength: TEAM_NAME_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(TEAM_NAME_MAX_LENGTH, {
    message: `Name must be at most ${TEAM_NAME_MAX_LENGTH} characters long`,
  })
  @Matches(TEAM_NAME_PATTERN, {
    message:
      "Name may only contain letters, spaces, hyphens, apostrophes and periods",
  })
  name!: string;

  /**
   * Normalised to uppercase before validation, so clients may send 'fra' and
   * the stored value is always 'FRA'.
   */
  @ApiProperty({
    description: 'Three-letter team code; stored uppercase',
    example: 'FRA',
    minLength: TEAM_CODE_LENGTH,
    maxLength: TEAM_CODE_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  @Matches(TEAM_CODE_PATTERN, {
    message: `Code must be exactly ${TEAM_CODE_LENGTH} alphanumeric characters`,
  })
  code!: string;

  @ApiProperty({
    description: 'URL of the team flag image',
    example: 'https://cdn.example.com/flags/fra.png',
    maxLength: TEAM_FLAG_MAX_LENGTH,
    required: false,
  })
  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Flag must be a valid http(s) URL' },
  )
  @MaxLength(TEAM_FLAG_MAX_LENGTH, {
    message: `Flag must be at most ${TEAM_FLAG_MAX_LENGTH} characters long`,
  })
  flag?: string;
}
