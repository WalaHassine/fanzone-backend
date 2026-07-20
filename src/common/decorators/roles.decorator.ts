import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/user/entities/user.entity';

/**
 * Metadata key used to store the roles allowed to access a route.
 * `RolesGuard` reads this key to authorize the authenticated user.
 */
export const ROLES_KEY = 'roles';

/**
 * @Roles(...roles)
 *
 * Restricts a route handler or controller to users whose `role` is one of the
 * provided `UserRole` values. Typed against the canonical `UserRole` enum so
 * invalid role names fail at compile time.
 *
 * Requires `RolesGuard` (and, upstream, `JwtAuthGuard`) to be applied so that
 * `request.user` is populated before authorization runs.
 *
 * @example
 * @Roles(UserRole.ADMIN)
 * @Post('matches')
 * createMatch() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
