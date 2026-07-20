import { registerAs } from '@nestjs/config';

export type JwtConfig = {
  secret: string;
  expiration: string;
  expiresInSeconds: number;
};

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Converts a human-readable duration ('1h', '15m', '7d') to a number of seconds.
 *
 * JWT_EXPIRATION is kept in the readable form because JwtModule consumes it
 * natively; the seconds value exists only to populate AuthResponseDto.expiresIn,
 * which the OAuth2 bearer response shape requires as a number.
 *
 * A bare number is accepted and treated as seconds.
 *
 * @throws Error on an unparseable value, so a bad env fails at boot rather than
 *         silently serving a wrong expiresIn to clients.
 */
export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)([smhd])?$/.exec(duration.trim());

  if (!match) {
    throw new Error(
      `Invalid JWT_EXPIRATION value "${duration}". Expected a number of seconds ` +
        `or a duration such as "30s", "15m", "1h", "7d".`,
    );
  }

  const [, amount, unit] = match;

  return Number(amount) * (unit ? DURATION_UNITS[unit] : 1);
}

/**
 * JWT configuration namespace.
 *
 * Single owner of JWT_SECRET / JWT_EXPIRATION — consumers read `jwt.secret`,
 * `jwt.expiration` and `jwt.expiresInSeconds` instead of reaching for the raw
 * environment keys.
 *
 * Requirement: EF-02 (secure JWT authentication).
 */
export default registerAs('jwt', (): JwtConfig => {
  const expiration = process.env.JWT_EXPIRATION ?? '1h';

  return {
    secret: process.env.JWT_SECRET ?? '',
    expiration,
    expiresInSeconds: parseDurationToSeconds(expiration),
  };
});
