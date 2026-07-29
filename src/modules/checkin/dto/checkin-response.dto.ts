import { ApiProperty } from '@nestjs/swagger';

/**
 * A check-in as returned to the client.
 *
 * Requirement: EF-10 — check in to a fan zone.
 * Requirement: ENF-05 — no user identifier leaves the API.
 *
 * Output DTO only. There is **no `userId` and no email here, by contract**: the
 * server stores the user id so a fan cannot check in twice, but what the client
 * holds is the opaque `sessionToken`. Adding a user identifier to this class
 * would break the anonymity guarantee the crowd endpoints rest on, so treat any
 * such edit as the contract violation it is — `checkin.controller.spec.ts`
 * asserts the mapped response carries neither key.
 */
export class CheckinResponseDto {
  @ApiProperty({
    description:
      'Opaque token identifying this check-in; returned instead of a user id',
    format: 'uuid',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  sessionToken!: string;

  @ApiProperty({
    description: 'UUID of the fan zone checked in to',
    format: 'uuid',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  })
  fanzoneId!: string;

  @ApiProperty({
    description: 'UUID of the team being supported',
    format: 'uuid',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
  })
  teamId!: string;

  @ApiProperty({
    description: 'When the check-in was recorded (ISO 8601)',
    example: '2026-07-27T18:30:00.000Z',
  })
  createdAt!: string;
}
