import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { MatchStatus } from '../entities/match.entity';
import { IsFutureDate } from '../../../common/validators/is-future-date.validator';

/**
 * Upper bound for the stadium name, mirroring the `varchar(255)` column on
 * MatchEntity so validation rejects what the database could not store.
 */
export const STADIUM_MAX_LENGTH = 255;

/**
 * Request body for scheduling a new match.
 *
 * Requirement: EF-06 — matches feed the public fixture list.
 *
 * Team IDs are referenced by the UUID `id` of TeamEntity; that both teams
 * actually exist (and differ) is enforced by the service layer, since
 * class-validator has no database access.
 */
export class CreateMatchDto {
  @ApiProperty({
    description: 'UUID of the home team (TeamEntity.id)',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  @IsUUID('all', { message: 'homeTeamId must be a valid UUID' })
  @IsNotEmpty({ message: 'homeTeamId is required' })
  homeTeamId!: string;

  @ApiProperty({
    description: 'UUID of the away team (TeamEntity.id)',
    example: '7a1e2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
    format: 'uuid',
  })
  @IsUUID('all', { message: 'awayTeamId must be a valid UUID' })
  @IsNotEmpty({ message: 'awayTeamId is required' })
  awayTeamId!: string;

  @ApiProperty({
    description: 'Kick-off time as an ISO 8601 datetime; must be in the future',
    example: '2026-11-21T16:00:00.000Z',
    format: 'date-time',
  })
  @IsISO8601(
    { strict: true },
    { message: 'matchDate must be a valid ISO 8601 datetime' },
  )
  @IsFutureDate({ message: 'matchDate must be a datetime in the future' })
  @IsNotEmpty({ message: 'matchDate is required' })
  matchDate!: string;

  @ApiProperty({
    description: 'Name of the stadium hosting the match',
    example: 'Lusail Stadium',
    maxLength: STADIUM_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty({ message: 'Stadium is required' })
  @MaxLength(STADIUM_MAX_LENGTH, {
    message: `Stadium must be at most ${STADIUM_MAX_LENGTH} characters long`,
  })
  stadium!: string;

  /**
   * Lifecycle status. Optional on input: omit it and the persistence layer
   * applies the `MatchStatus.SCHEDULED` default (see MatchEntity).
   */
  @ApiProperty({
    description: 'Lifecycle status of the match',
    enum: MatchStatus,
    enumName: 'MatchStatus',
    default: MatchStatus.SCHEDULED,
    required: false,
  })
  @IsOptional()
  @IsEnum(MatchStatus, {
    message: 'Status must be one of: SCHEDULED, LIVE, COMPLETED, CANCELLED',
  })
  status?: MatchStatus = MatchStatus.SCHEDULED;
}
