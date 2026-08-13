import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { IsFutureDate } from '../../../common/validators/is-future-date.validator';

/** Matches `AlertEntity.customMessage`'s column width. */
export const CUSTOM_MESSAGE_MAX_LENGTH = 255;

/**
 * Body of `POST /alerts` — a fan asking to be reminded about a match (EF-16).
 *
 * There is deliberately **no** user field, the same contract `CreateCheckinDto`
 * states: identity comes from the verified JWT via `@CurrentUser()`, and a
 * body-supplied user id would let a caller schedule alerts on somebody else's
 * behalf.
 *
 * `triggerTime` is an absolute instant, not an offset before kick-off. That
 * follows `AlertEntity.triggerTime` being a `timestamp with time zone`, and it
 * is exactly what `AlertSuggestionDto.suggestedTriggerTimes[].triggerTime`
 * hands the client from the EF-15 suggestion endpoint — so a fan can post back
 * a suggested value unchanged.
 *
 * The future check appears twice on purpose: `@IsFutureDate` turns it into a 400
 * from the global pipe before the service is entered, and `AlertService` repeats
 * it for callers that never go through HTTP. Neither makes the other redundant.
 */
export class CreateAlertDto {
  @ApiProperty({
    description: 'UUID of the match to be reminded about',
    format: 'uuid',
    example: '7d3f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  })
  @IsUUID('all', { message: 'matchId must be a valid UUID' })
  matchId!: string;

  @ApiProperty({
    description:
      'When to send the alert (ISO 8601). Must be in the future and before kick-off',
    example: '2026-06-15T17:00:00.000Z',
  })
  @IsISO8601(
    { strict: true },
    { message: 'triggerTime must be an ISO 8601 datetime string' },
  )
  @IsFutureDate({ message: 'triggerTime must be a datetime in the future' })
  triggerTime!: string;

  @ApiPropertyOptional({
    description:
      'Text to remind the fan with. Omit to have one derived from the fixture',
    maxLength: CUSTOM_MESSAGE_MAX_LENGTH,
    example: 'Meet the lads at the fan zone an hour early',
  })
  @IsOptional()
  @IsString({ message: 'customMessage must be a string' })
  @MaxLength(CUSTOM_MESSAGE_MAX_LENGTH, {
    message: `customMessage must be at most ${CUSTOM_MESSAGE_MAX_LENGTH} characters`,
  })
  customMessage?: string;
}
