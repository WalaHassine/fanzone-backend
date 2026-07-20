import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../user/entities/user.entity';

/**
 * JwtStrategy
 *
 * Verifies incoming JWTs on protected routes (via `AuthGuard('jwt')`).
 * passport-jwt extracts the Bearer token, verifies its signature against
 * JWT_SECRET and — because `ignoreExpiration` is false — rejects expired
 * tokens automatically (401) before `validate()` is ever called.
 *
 * Expected token payload: { sub: userId, email, role }.
 * Whatever `validate()` returns is attached to `req.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    // Computed before super() (does not touch `this`, so it is legal).
    // Fail loudly rather than silently running on an insecure fallback secret.
    // Reads the same `jwt` namespace AuthModule signs with, so verification
    // and signing can never diverge onto different secrets.
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in the environment');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; role: UserRole }) {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
