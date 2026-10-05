import { ApiProperty } from '@nestjs/swagger';

/**
 * One proposed alert time for a match.
 *
 * Output DTO only, no validators — the module convention for anything the
 * service produces rather than consumes.
 *
 * Both a relative offset and an absolute instant are carried on purpose.
 * `AlertEntity.triggerTime` is a `timestamp with time zone`, so the client will
 * eventually post back an instant; sending only `offsetSeconds` would make it
 * recompute `matchDate - offset` locally, and a client in another timezone
 * doing that arithmetic is exactly how alerts fire an hour late. `label` and
 * `offsetSeconds` remain because the UI renders the choice as "24 hours before",
 * not as a date.
 */
export class SuggestedAlertTimeDto {
  @ApiProperty({
    description: 'Human-readable description of when the alert would fire',
    example: '24 hours before',
  })
  label!: string;

  @ApiProperty({
    description: 'How far before kick-off the alert fires, in seconds',
    example: 86400,
    minimum: 0,
  })
  offsetSeconds!: number;

  @ApiProperty({
    description:
      'The instant the alert would fire (ISO 8601), i.e. matchDate minus offsetSeconds',
    example: '2026-06-17T18:00:00.000Z',
    format: 'date-time',
  })
  triggerTime!: string;
}

/**
 * A suggestion that the user set alerts for an upcoming match.
 *
 * Requirement: EF-15 — suggest relevant alerts.
 *
 * Output DTO only, and nothing is persisted when one is produced: this is a
 * proposal, and the user creating an alert from it is EF-16's job.
 *
 * `suggestedTriggerTimes` only ever contains instants **still in the future**.
 * A fixed 7d/24h/1h/30min ladder would otherwise offer a "7 days before" option
 * for a match three days away, which is an alert that can never fire. It can
 * therefore be shorter than the full ladder, and is never empty — a match with
 * no future trigger times yields no suggestion at all rather than an empty one.
 */
export class AlertSuggestionDto {
  @ApiProperty({
    description: 'UUID of the match the alerts would be set for',
    example: 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70',
    format: 'uuid',
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
    description: 'Kick-off time as an ISO 8601 datetime',
    example: '2026-06-18T18:00:00.000Z',
    format: 'date-time',
  })
  matchDate!: string;

  /**
   * Which of the user's favourite teams triggered the suggestion. When both
   * sides are followed, the home team is named — the suggestion is one nudge,
   * not one per team.
   */
  @ApiProperty({
    description:
      "The user's favourite team playing in this match, and the reason it was suggested",
    example: 'Tunisia',
  })
  teamName!: string;

  @ApiProperty({
    description:
      'Proposed alert times, soonest offset last, limited to instants still in the future',
    type: () => SuggestedAlertTimeDto,
    isArray: true,
  })
  suggestedTriggerTimes!: SuggestedAlertTimeDto[];
}
