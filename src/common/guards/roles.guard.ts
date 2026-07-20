import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/user/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Shape of the object Passport attaches to `request.user`, as returned by
 * `JwtStrategy.validate()`. Note `role` is a single value, not an array.
 */
interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * RolesGuard
 *
 * Authorizes an already-authenticated request against the roles declared with
 * `@Roles(...)`. Must run after `JwtAuthGuard` so that `request.user` is set.
 *
 * Flow:
 * - Reads the required roles from `@Roles()` metadata (handler overrides
 *   controller).
 * - If no `@Roles()` is present, the route is not role-restricted → allow.
 * - Otherwise grants access only when the user's single `role` is among the
 *   required roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Method-level metadata overrides controller-level metadata.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator (or an empty list) → route is not role-restricted.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    // No authenticated user (e.g. RolesGuard used without JwtAuthGuard) → deny.
    if (!user) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }
}
