import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

/**
 * Password strength policy.
 *
 * The four lookaheads *require* a lowercase letter, an uppercase letter, a digit
 * and one of @$!%*?& — while the trailing `.{8,}` deliberately does not
 * *restrict* the alphabet to that set. A password containing '#', '-' or a space
 * is therefore accepted, provided it also satisfies the lookaheads.
 */
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

export const PASSWORD_MESSAGE =
  'Password must contain at least one uppercase letter, one lowercase letter, ' +
  'one number and one special character (@$!%*?&)';

/**
 * Registration request payload.
 *
 * Requirement: EF-01 — "Le système doit permettre à un utilisateur de créer un
 * compte via email et mot de passe".
 *
 * Validated automatically by the global ValidationPipe registered in AppModule.
 */
export class RegisterDto {
  /**
   * Account email. Must be unique — uniqueness is enforced by the service layer,
   * not here, since class-validator has no database access.
   */
  @ApiProperty({
    description: 'Email address used to identify the account',
    example: 'fan@worldcup.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  /**
   * Plain-text password. Hashed with bcrypt before persistence (ENF-03) — it is
   * never stored or returned as-is.
   */
  @ApiProperty({
    description:
      'Password: minimum 8 characters, with at least one uppercase letter, ' +
      'one lowercase letter, one number and one special character (@$!%*?&)',
    example: 'Passw0rd!',
    minLength: 8,
    pattern: PASSWORD_PATTERN.source,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;
}
