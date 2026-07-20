import { ApiProperty } from '@nestjs/swagger';

/**
 * Authentication response returned by both register and login.
 *
 * Requirement: EF-02 — "Connexion réussie retourne un token valide".
 *
 * Follows the OAuth2 bearer-token response shape. This is an output DTO only:
 * it carries no class-validator decorators because it is never bound to an
 * incoming request.
 */
export class AuthResponseDto {
  /**
   * Signed JWT. Payload contract is fixed by JwtStrategy: { sub, email, role }.
   */
  @ApiProperty({
    description: 'Signed JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abc123',
  })
  accessToken!: string;

  /**
   * Token lifetime in seconds, derived once at config load from JWT_EXPIRATION
   * (see jwt.config.ts). Seconds — not the '1h' duration string — because the
   * OAuth2 response shape requires a number.
   */
  @ApiProperty({
    description: 'Token lifetime in seconds',
    example: 3600,
  })
  expiresIn!: number;

  /**
   * Always 'Bearer'. Tells the client how to present the token:
   * `Authorization: Bearer <accessToken>`.
   */
  @ApiProperty({
    description: 'Token type — always "Bearer"',
    example: 'Bearer',
    default: 'Bearer',
  })
  tokenType!: string;
}
