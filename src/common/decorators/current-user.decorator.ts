import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../modules/user/entities/user.entity';

/**
 * The authenticated principal attached to `req.user` by `JwtStrategy.validate()`.
 * Sourced from the verified JWT payload — never from the request body.
 */
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * @CurrentUser()
 *
 * Injects the authenticated user (`req.user`) into a route handler parameter,
 * so protected handlers can read the principal without touching the raw
 * request. Only meaningful on routes guarded by `JwtAuthGuard`; on an
 * unguarded route `req.user` is undefined.
 *
 * @example
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@CurrentUser() user: AuthUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
