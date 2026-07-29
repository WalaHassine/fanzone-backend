import { ApiProperty } from '@nestjs/swagger';

/**
 * The fan zone details carried inside one of the caller's check-ins.
 *
 * Output DTO only. Enough to render the check-in without a second request, and
 * no more — no coordinates, no capacity, no PostGIS `location`. Callers wanting
 * the full record have `GET /fanzones/:id`.
 */
export class CheckinFanzoneInfoDto {
  @ApiProperty({
    description: 'Display name of the fan zone',
    example: 'Tunis Stadium',
  })
  name!: string;

  @ApiProperty({
    description: 'City the fan zone is located in',
    example: 'Tunis',
  })
  city!: string;

  @ApiProperty({
    description: 'Street address of the fan zone',
    example: '123 Main St',
  })
  address!: string;
}

/**
 * One of the caller's own check-ins.
 *
 * Output DTO only. Identified by its `sessionToken` — the same opaque handle
 * `CheckinResponseDto` returns — and carrying the team by name, so no user
 * identifier appears even in a per-user listing.
 */
export class UserCheckinItemDto {
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

  @ApiProperty({
    description: 'When the check-in was recorded (ISO 8601)',
    example: '2026-07-27T18:30:00.000Z',
  })
  checkedInAt!: string;
}

/**
 * The authenticated fan's own check-in history.
 *
 * Requirement: EF-03 — the user profile shows their check-ins.
 * Requirement: ENF-05 — no personally identifying data in a check-in payload.
 *
 * Output DTO only. This is the one place check-in rows are returned per person
 * rather than aggregated, and it stays within ENF-05 for two reasons: the rows
 * are selected by the id on the caller's verified JWT, so a fan only ever sees
 * their own, and the shape still carries no `userId` — a check-in is identified
 * by its `sessionToken` here exactly as it is everywhere else.
 *
 * The field is named `sessionTokens` because that is the agreed wire contract,
 * but note that each element is a **whole check-in** — fan zone, team and
 * timestamp — not a bare token. Renaming it is a breaking change for clients.
 */
export class UserCheckinsDto {
  @ApiProperty({
    description:
      "The caller's check-ins, newest first. Each entry is a full check-in keyed by its session token.",
    type: () => UserCheckinItemDto,
    isArray: true,
  })
  sessionTokens!: UserCheckinItemDto[];
}
