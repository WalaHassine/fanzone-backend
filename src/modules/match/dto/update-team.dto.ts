import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';
import {
  TEAM_CODE_LENGTH,
  TEAM_CODE_PATTERN,
  TEAM_FLAG_MAX_LENGTH,
  TEAM_NAME_MAX_LENGTH,
  TEAM_NAME_PATTERN,
} from './create-team.dto';

/**
 * Partial update of a team — every field of CreateTeamDto, all optional.
 *
 * `@AtLeastOneField` rejects an empty `{}` body: a no-op update is almost always
 * a client bug, not an intent. When present, each field is validated with the
 * same rules as on create, reusing the constants and patterns declared there.
 *
 * Deliberately NOT derived via `PartialType(CreateTeamDto)`, matching the
 * convention established by UpdateMatchDto.
 */
@AtLeastOneField(['name', 'code', 'flag'], {
  message: 'At least one of name, code, flag must be provided',
})
export class UpdateTeamDto {
  @ApiPropertyOptional({
    description: 'Full name of the team',
    example: 'France',
    maxLength: TEAM_NAME_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(TEAM_NAME_MAX_LENGTH, {
    message: `Name must be at most ${TEAM_NAME_MAX_LENGTH} characters long`,
  })
  @Matches(TEAM_NAME_PATTERN, {
    message:
      'Name may only contain letters, spaces, hyphens, apostrophes and periods',
  })
  name?: string;

  @ApiPropertyOptional({
    description: 'Three-letter team code; stored uppercase',
    example: 'FRA',
    minLength: TEAM_CODE_LENGTH,
    maxLength: TEAM_CODE_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsString()
  @Matches(TEAM_CODE_PATTERN, {
    message: `Code must be exactly ${TEAM_CODE_LENGTH} alphanumeric characters`,
  })
  code?: string;

  @ApiPropertyOptional({
    description: 'URL of the team flag image',
    example: 'https://cdn.example.com/flags/fra.png',
    maxLength: TEAM_FLAG_MAX_LENGTH,
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
