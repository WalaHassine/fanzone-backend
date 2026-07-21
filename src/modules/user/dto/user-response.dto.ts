import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '../entities/user.entity';
import { UserPreferenceDto } from './user-preference.dto';

/**
 * Public projection of a user account.
 *
 * Output DTO only: it carries no class-validator decorators because it is never
 * bound to an incoming request. It deliberately omits `passwordHash` and any
 * other credential material — only identity, role and preferences are exposed.
 */
export class UserResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the user',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Email address of the user',
    example: 'fan@worldcup.com',
    format: 'email',
  })
  email!: string;

  @ApiProperty({
    description: 'Account role',
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.USER,
  })
  role!: UserRole;

  /**
   * Names of the user's favourite teams (EF-03) — resolved from the
   * user_favorite_teams relation, exposed as plain names rather than IDs.
   */
  @ApiProperty({
    description: 'Names of the teams the user follows',
    type: [String],
    example: ['France', 'Tunisia'],
  })
  favoriteTeams!: string[];

  @ApiProperty({
    description: 'Fan-zone preferences (city and ambiance)',
    type: () => UserPreferenceDto,
  })
  preferences!: UserPreferenceDto;

  @ApiProperty({
    description: 'Account creation timestamp (ISO 8601)',
    example: '2026-07-21T12:00:00.000Z',
    format: 'date-time',
  })
  createdAt!: Date;
}
