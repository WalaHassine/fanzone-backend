import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard
 *
 * Authenticates requests using the Passport `jwt` strategy (`JwtStrategy`),
 * with an escape hatch for routes marked `@Public()`.
 *
 * Flow:
 * - If the handler or its controller carries `@Public()` metadata, access is
 *   granted immediately without touching the JWT strategy.
 * - Otherwise it delegates to `AuthGuard('jwt')`, which extracts and verifies
 *   the Bearer token and populates `request.user` with the value returned by
 *   `JwtStrategy.validate()` (`{ userId, email, role }`). Missing, invalid, or
 *   expired tokens are rejected with a 401 automatically.
 *
 * Apply first when combining guards, so that `RolesGuard` has an authenticated
 * user to authorize:
 * `@UseGuards(JwtAuthGuard, RolesGuard)`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Method-level metadata overrides controller-level metadata.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
