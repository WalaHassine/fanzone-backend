import { ApiProperty } from '@nestjs/swagger';

import { AlertStatus } from '../entities/alert.entity';

/**
 * An alert as returned to the client.
 *
 * Requirement: EF-16 — activate an alert for a favourite team's match.
 *
 * Output DTO only: `@ApiProperty` and no validators, and every instant is an ISO
 * 8601 `string` rather than a `Date`, matching `CheckinResponseDto` and the
 * recommendation DTOs. There is **no `userId`**: the caller is the owner of
 * every alert this shape is returned for, so repeating their id would add
 * nothing and would break the convention the check-in responses set.
 *
 * The fixture is carried inline — `homeTeam`, `awayTeam`, `matchDate` — rather
 * than leaving the client to resolve `matchId` against `/matches`. It costs
 * nothing: `AlertEntity.match` is an eager relation and its teams are eager in
 * turn, so the rows are already loaded by the time a mapper runs. A bare list of
 * UUIDs would be unreadable as a fan's alert list.
 *
 * `status` reuses the real `AlertStatus` enum instead of a hand-written list of
 * the three strings; a second copy of the values is a second place to forget.
 */
export class AlertResponseDto {
  @ApiProperty({
    description: 'UUID of the alert',
    format: 'uuid',
    example: '5f6a7b8c-9d0e-41f2-a3b4-c5d6e7f8a9b0',
  })
  id!: string;

  @ApiProperty({
    description: 'UUID of the match being alerted on',
    format: 'uuid',
    example: '7d3f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  })
  matchId!: string;

  @ApiProperty({
    description: 'Name of the home team',
    example: 'Tunisia',
  })
  homeTeam!: string;

  @ApiProperty({
    description: 'Name of the away team',
    example: 'France',
  })
  awayTeam!: string;

  @ApiProperty({
    description: 'Kick-off (ISO 8601)',
    example: '2026-06-15T18:00:00.000Z',
  })
  matchDate!: string;

  @ApiProperty({
    description: 'When the alert is due to be sent (ISO 8601)',
    example: '2026-06-15T17:00:00.000Z',
  })
  triggerTime!: string;

  @ApiProperty({
    description: 'Lifecycle state of the alert',
    enum: AlertStatus,
    example: AlertStatus.PENDING,
  })
  status!: AlertStatus;

  @ApiProperty({
    description:
      "The fan's own reminder text, or one derived from the fixture and lead time",
    example: 'Tunisia vs France kicks off in 1 hour',
  })
  message!: string;

  @ApiProperty({
    description: 'When the alert was sent (ISO 8601), or null while pending',
    nullable: true,
    example: null,
  })
  sentAt!: string | null;

  @ApiProperty({
    description: 'When the alert was created (ISO 8601)',
    example: '2026-06-08T09:12:00.000Z',
  })
  createdAt!: string;
}
