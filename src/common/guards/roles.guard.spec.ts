import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../modules/user/entities/user.entity';

/**
 * Builds a minimal ExecutionContext exposing the handler/class (for metadata
 * reflection) and a request carrying `user`.
 */
function makeContext(user: unknown): ExecutionContext {
  const handler = function handler() {};
  const controller = class Controller {};
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  /** The shape JwtStrategy.validate() attaches to req.user. */
  const adminUser = { userId: 'u-1', email: 'admin@worldcup.com', role: UserRole.ADMIN };
  const normalUser = { userId: 'u-2', email: 'fan@worldcup.com', role: UserRole.USER };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('reads @Roles metadata from the handler and the class (method overrides class)', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const ctx = makeContext(adminUser);

    guard.canActivate(ctx);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  });

  it('allows access when no @Roles() decorator is present (undefined metadata)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(makeContext(normalUser))).toBe(true);
  });

  it('allows access when @Roles() is present but empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(makeContext(normalUser))).toBe(true);
  });

  it('allows access when the user has the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(makeContext(adminUser))).toBe(true);
  });

  it('grants access when the user role is one of several allowed roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.USER]);

    expect(guard.canActivate(makeContext(normalUser))).toBe(true);
  });

  it('denies access when the user lacks the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(makeContext(normalUser))).toBe(false);
  });

  it('denies access when the request has no authenticated user', () => {
    // e.g. RolesGuard applied without JwtAuthGuard in front of it.
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });
});
