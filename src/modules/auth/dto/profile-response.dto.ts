import { ApiProperty } from '@nestjs/swagger';

/**
 * Profile of the currently authenticated user, returned by GET /auth/profile.
 *
 * Requirement: EF-02 — confirms the caller is authenticated by echoing the
 * identity carried in their verified JWT. Deliberately excludes `role` and any
 * credential material; it exposes only what the token already asserts.
 */
export class ProfileResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the authenticated user',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
  })
  userId!: string;

  @ApiProperty({
    description: 'Email address of the authenticated user',
    example: 'fan@worldcup.com',
  })
  email!: string;
}
