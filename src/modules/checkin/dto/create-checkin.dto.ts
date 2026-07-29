import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Body of `POST /checkins` — a fan declaring their presence at a fan zone and
 * the team they are supporting there (EF-10).
 *
 * There is deliberately **no** user field. The identity comes from the verified
 * JWT via `@CurrentUser()`, exactly as in UserController: a body-supplied user id
 * would let a caller check in as somebody else, and would also let one client
 * inflate a crowd count under borrowed identities.
 */
export class CreateCheckinDto {
  @ApiProperty({
    description: 'UUID of the fan zone being checked in to',
    format: 'uuid',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  })
  @IsUUID('all', { message: 'fanzoneId must be a valid UUID' })
  fanzoneId!: string;

  @ApiProperty({
    description:
      'UUID of the team being supported; must be broadcast at this fan zone',
    format: 'uuid',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
  })
  @IsUUID('all', { message: 'teamId must be a valid UUID' })
  teamId!: string;
}
