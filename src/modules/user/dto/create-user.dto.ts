import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { UserRole } from '../entities/user.entity';

/**
 * Internal payload for creating a user record.
 *
 * Requirement: EF-01 — "créer un compte via email et mot de passe" (the account
 * itself; team/city/ambiance preferences arrive via EF-03/EF-04/EF-05).
 *
 * This is a service-layer DTO, not a public request body: `passwordHash` is
 * already-hashed material set by AuthService, never accepted from a client. It
 * is therefore hidden from Swagger.
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'Email address used to identify the account',
    example: 'fan@worldcup.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsString()
  email!: string;

  /**
   * bcrypt-hashed password, populated by AuthService after hashing the plaintext
   * — never bound from an incoming request, hence hidden from the API surface.
   */
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  passwordHash?: string;

  /**
   * Account role. Optional on input: omit it and the persistence layer applies
   * the `UserRole.USER` default (see UserEntity).
   */
  @ApiProperty({
    description: 'Account role',
    enum: UserRole,
    enumName: 'UserRole',
    default: UserRole.USER,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Role must be one of: ADMIN, USER' })
  role?: UserRole;
}
