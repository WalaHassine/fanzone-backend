import { ApiProperty } from '@nestjs/swagger';

import { CheckinFanzoneInfoDto } from './user-checkins.dto';

/**
 * One check-in, looked up by its session token.
 *
 * Requirement: EF-10 — the check-in lifecycle.
 * Requirement: ENF-05 — no personally identifying data in a check-in payload.
 *
 * Output DTO only. This is the payload of the **public** `GET /checkins/:sessionToken`:
 * the token is the credential, and what it unlocks names a fan zone, a team and
 * a time — never a person. There is no `userId` here by contract, and the fan
 * zone is carried by the already-narrow `CheckinFanzoneInfoDto` (name, city and
 * address; no capacity, no PostGIS `location`).
 *
 * **Structurally identical to `UserCheckinItemDto`, on purpose, and it must stay
 * separate.** That one is the shape of an item in the authenticated caller's own
 * listing, so it is free to gain a caller-relative field later — `canCheckout`,
 * `isActive`, anything answered from the JWT. Binding this anonymous payload to
 * it would put every such field on an unauthenticated route with no review step.
 * The duplication is the review step.
 */
export class CheckinDetailDto {
  @ApiProperty({
    description: 'Token identifying this check-in',
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
    description: 'Enough of the fan zone to render the check-in',
    type: () => CheckinFanzoneInfoDto,
  })
  fanzoneInfo!: CheckinFanzoneInfoDto;

  @ApiProperty({
    description: 'Name of the team being supported',
    example: 'Tunisia',
  })
  teamName!: string;

  /**
   * Named `checkedInAt` rather than `createdAt`: this route is the singular of
   * `GET /users/checkins`, not the echo of the POST, so a client can treat a
   * detail response and a listing item as the same JSON.
   */
  @ApiProperty({
    description: 'When the check-in was recorded (ISO 8601)',
    example: '2026-07-27T18:30:00.000Z',
  })
  checkedInAt!: string;
}
