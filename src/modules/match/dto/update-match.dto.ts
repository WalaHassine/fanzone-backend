import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { MatchStatus } from '../entities/match.entity';
import { AtLeastOneField } from '../../../common/validators/at-least-one-field.validator';
import { IsFutureDate } from '../../../common/validators/is-future-date.validator';
import { STADIUM_MAX_LENGTH } from './create-match.dto';

/**
 * Partial update of a match — every field of CreateMatchDto, all optional.
 *
 * `@AtLeastOneField` rejects an empty `{}` body: a no-op update is almost always
 * a client bug, not an intent. When present, each field is validated with the
 * same rules as on create (UUID teams, future ISO 8601 date, bounded stadium).
 *
 * Deliberately NOT derived via `PartialType(CreateMatchDto)`: writing the fields
 * out keeps the optionality and the at-least-one rule visible in one place
 * rather than spread across a base class and a mixin — matching the convention
 * established by UpdateUserPreferenceDto.
 */
@AtLeastOneField(
  ['homeTeamId', 'awayTeamId', 'matchDate', 'stadium', 'status'],
  {
    message:
      'At least one of homeTeamId, awayTeamId, matchDate, stadium, status must be provided',
  },
)
export class UpdateMatchDto {
  @ApiPropertyOptional({
    description: 'UUID of the home team (TeamEntity.id)',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'homeTeamId must be a valid UUID' })
  homeTeamId?: string;

  @ApiPropertyOptional({
    description: 'UUID of the away team (TeamEntity.id)',
    example: '7a1e2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('all', { message: 'awayTeamId must be a valid UUID' })
  awayTeamId?: string;

  @ApiPropertyOptional({
    description: 'Kick-off time as an ISO 8601 datetime; must be in the future',
    example: '2026-11-21T16:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'matchDate must be a valid ISO 8601 datetime' },
  )
  @IsFutureDate({ message: 'matchDate must be a datetime in the future' })
  matchDate?: string;

  @ApiPropertyOptional({
    description: 'Name of the stadium hosting the match',
    example: 'Lusail Stadium',
    maxLength: STADIUM_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(STADIUM_MAX_LENGTH, {
    message: `Stadium must be at most ${STADIUM_MAX_LENGTH} characters long`,
  })
  stadium?: string;

  @ApiPropertyOptional({
    description: 'Lifecycle status of the match',
    enum: MatchStatus,
    enumName: 'MatchStatus',
    example: MatchStatus.LIVE,
  })
  @IsOptional()
  @IsEnum(MatchStatus, {
    message: 'Status must be one of: SCHEDULED, LIVE, COMPLETED, CANCELLED',
  })
  status?: MatchStatus;
}
