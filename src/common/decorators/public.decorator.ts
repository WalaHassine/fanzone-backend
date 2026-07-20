import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used to flag a route (or an entire controller) as public.
 * `JwtAuthGuard` reads this key to decide whether to skip JWT validation.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public()
 *
 * Marks a route handler or controller as publicly accessible, exempting it
 * from JWT authentication when `JwtAuthGuard` is applied.
 *
 * Use on endpoints that must be reachable without a token, e.g.
 * `POST /auth/register` and `POST /auth/login` (EF-01, EF-02).
 *
 * @example
 * @Public()
 * @Post('login')
 * login(@Body() dto: LoginDto) { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
