import { ApiProperty } from '@nestjs/swagger';

import { TEAM_CODE_LENGTH } from './create-team.dto';

/**
 * Public projection of a team.
 *
 * Output DTO only: it carries no validators, since it is never bound to an
 * incoming request. Internal relations (matches, users, fanzones, check-ins)
 * are deliberately omitted.
 */
export class TeamResponseDto {
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
    minLength: TEAM_CODE_LENGTH,
    maxLength: TEAM_CODE_LENGTH,
  })
  code!: string;

  @ApiProperty({
    description: 'URL of the team flag image, or null when unset',
    example: 'https://cdn.example.com/flags/fra.png',
    nullable: true,
  })
  flag!: string | null;

  @ApiProperty({
    description: 'Creation timestamp as an ISO 8601 datetime',
    example: '2026-07-27T10:15:00.000Z',
    format: 'date-time',
  })
  createdAt!: string;
}
