import { ApiProperty } from '@nestjs/swagger';

import { MatchStatus } from '../entities/match.entity';

/**
 * Public projection of a team as it appears embedded in a match.
 *
 * Output DTO only: no class-validator decorators, since it is never bound to an
 * incoming request. It exposes the identity fields a client needs to render a
 * fixture — id, full name and the 3-letter code — and omits internal relations.
 */
export class TeamSummaryDto {
  @ApiProperty({
    description: 'Unique identifier of the team',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Full name of the team',
    example: 'France',
  })
  name!: string;

  @ApiProperty({
    description: 'Three-letter team code',
    example: 'FRA',
    minLength: 3,
    maxLength: 3,
  })
  code!: string;
}

/**
 * Public projection of a match.
 *
 * Requirement: EF-06 — the shape returned by the list/detail endpoints.
 *
 * Output DTO only: it carries no validators. Both teams are embedded as
 * TeamSummaryDto rather than exposed as bare foreign-key IDs, so a client can
 * render a fixture without a second lookup.
 */
export class MatchResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the match',
    example: 'b2c4d6e8-0a1b-4c3d-9e8f-1a2b3c4d5e6f',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Home team',
    type: () => TeamSummaryDto,
  })
  homeTeam!: TeamSummaryDto;

  @ApiProperty({
    description: 'Away team',
    type: () => TeamSummaryDto,
  })
  awayTeam!: TeamSummaryDto;

  @ApiProperty({
    description: 'Kick-off time as an ISO 8601 datetime',
    example: '2026-11-21T16:00:00.000Z',
    format: 'date-time',
  })
  matchDate!: string;

  @ApiProperty({
    description: 'Name of the stadium hosting the match',
    example: 'Lusail Stadium',
  })
  stadium!: string;

  @ApiProperty({
    description: 'Lifecycle status of the match',
    enum: MatchStatus,
    enumName: 'MatchStatus',
    example: MatchStatus.SCHEDULED,
  })
  status!: MatchStatus;
}
