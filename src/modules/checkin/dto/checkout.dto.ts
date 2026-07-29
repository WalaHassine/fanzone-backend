import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Body of `DELETE /checkins/:sessionToken` — a fan leaving a fan zone.
 *
 * Requirement: EF-10 — the check-in lifecycle.
 *
 * As with `CreateCheckinDto`, there is no user field: ownership is checked
 * against the verified JWT, so a caller cannot check somebody else out.
 *
 * `fanzoneId` looks redundant next to a token that already identifies the row,
 * and that is the point — it is a guard, not a lookup key. The service compares
 * it to the stored `fanzoneId` and rejects a mismatch, so a client holding a
 * stale token cannot free a spot at the wrong venue and corrupt that zone's
 * occupancy figure.
 */
export class CheckoutDto {
  @ApiProperty({
    description: 'Token identifying the check-in to remove',
    format: 'uuid',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @IsUUID('all', { message: 'sessionToken must be a valid UUID' })
  sessionToken!: string;

  @ApiProperty({
    description:
      'UUID of the fan zone the check-in belongs to; validated against the stored value',
    format: 'uuid',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  })
  @IsUUID('all', { message: 'fanzoneId must be a valid UUID' })
  fanzoneId!: string;
}
