import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function makeContext(): ExecutionContext {
  const handler = function handler() {};
  const controller = class Controller {};
  return {
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard (EF-02)', () => {
  let guard: JwtAuthGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  // The parent is the Passport AuthGuard('jwt') mixin; spying on its prototype
  // lets us assert delegation without a real Passport/JWT pipeline.
  let superCanActivate: jest.SpyInstance;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector);

    superCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads the @Public metadata from the handler and the class', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = makeContext();

    guard.canActivate(ctx);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  });

  it('bypasses JWT validation for @Public() routes', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(makeContext())).toBe(true);
    // The Passport strategy must NOT run for public routes.
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('delegates to the Passport JWT guard when the route is not public', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = makeContext();

    const result = guard.canActivate(ctx);

    expect(superCanActivate).toHaveBeenCalledWith(ctx);
    expect(result).toBe(true); // whatever Passport returns is passed through
  });

  it('delegates to Passport when no @Public metadata is set (undefined)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    guard.canActivate(makeContext());

    expect(superCanActivate).toHaveBeenCalled();
  });
});
