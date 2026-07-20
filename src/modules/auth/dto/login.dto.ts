import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Login request payload.
 *
 * Requirement: EF-02 — "Le système doit permettre à un utilisateur de
 * s'authentifier de manière sécurisée (JWT)".
 *
 * Deliberately NOT derived from RegisterDto via PickType: inheriting the
 * strength regex would lock out accounts created under an earlier policy.
 * Login enforces shape only — credential correctness is the service's job.
 */
export class LoginDto {
  @ApiProperty({
    description: 'Email address of the account',
    example: 'fan@worldcup.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  /**
   * Plain-text password. No strength requirements on login — any password that
   * meets the minimum length is accepted and checked against the stored hash.
   */
  @ApiProperty({
    description: 'Account password (minimum 8 characters)',
    example: 'Passw0rd!',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}
