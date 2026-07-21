import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

import { MatchStatus } from '../entities/match.entity';

/**
 * Query parameters for listing/filtering matches.
 *
 * Requirement: EF-06 — list matches.
 * Requirement: EF-07 — filter matches by team.
 *
 * Every field is optional and independent: an empty filter lists all matches,
 * so — unlike a partial update — this DTO does NOT require at least one field.
 * `teamName` matches a home OR away team; `startDate`/`endDate` bound the
 * `matchDate` range; `status` narrows by lifecycle stage. Combining logic lives
 * in the service.
 */
export class MatchFilterDto {
  @ApiPropertyOptional({
    description:
      'Filter by team name, matching either the home or the away team (EF-07)',
    example: 'France',
  })
  @IsOptional()
  @IsString()
  teamName?: string;

  @ApiPropertyOptional({
    description: 'Start of the match-date range, as an ISO 8601 datetime',
    example: '2026-11-21T00:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'startDate must be a valid ISO 8601 datetime' },
  )
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End of the match-date range, as an ISO 8601 datetime',
    example: '2026-11-30T23:59:59.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'endDate must be a valid ISO 8601 datetime' },
  )
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by lifecycle status',
    enum: MatchStatus,
    enumName: 'MatchStatus',
    example: MatchStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(MatchStatus, {
    message: 'Status must be one of: SCHEDULED, LIVE, COMPLETED, CANCELLED',
  })
  status?: MatchStatus;
}
