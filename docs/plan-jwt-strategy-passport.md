# Plan: JWT Strategy & Passport Configuration

## Context

The app needs to authenticate requests via JWT. `AuthModule` is already wired
(`PassportModule`, `JwtModule.registerAsync` with `ConfigService`, and `JwtStrategy`
listed as a provider), but two problems block the feature from actually working:

1. The current `JwtStrategy` ([src/modules/auth/strategies/jwt.strategy.ts](../src/modules/auth/strategies/jwt.strategy.ts))
   is a skeleton: it returns only `{ userId, email }` (no `role`), and it falls back to a
   hardcoded `'change-me'` secret.
2. **`JWT_SECRET` and `JWT_EXPIRATION` are not defined in any `.env` file.** Both the
   strategy and `JwtModule` read them, so today the strategy silently runs on the insecure
   `'change-me'` fallback and `JwtModule` signs with `secret: undefined`.

Goal: a correct, secure `JwtStrategy` that extracts a Bearer token, verifies it against the
env secret, rejects expired tokens automatically, and attaches `{ userId, email, role }` to
`req.user` — plus the missing env config that makes it real.

## Decisions (confirmed with user)

- **Payload shape uses the singular `role`** (matches `UserEntity.role: UserRole`), not the
  spec's plural `roles`. Payload = `{ sub, email, role }`; `validate()` returns
  `{ userId, email, role }`.
- **`ignoreExpiration: false`** — the strategy is what verifies tokens on incoming requests
  (`JwtModule` only *signs*). `false` makes `jsonwebtoken` auto-reject expired tokens (a 401),
  which is exactly the "JWT layer validates expiration" behavior intended — no manual
  `payload.exp` checks needed.
- **No extra scaffolding** (no `JwtAuthGuard`, no `@CurrentUser`, no RBAC, no
  `@types/passport-jwt`) for now — strictly the strategy + required config.

## Changes

### 1. Rewrite `src/modules/auth/strategies/jwt.strategy.ts`
- Import `UserRole` from `../../user/entities/user.entity`.
- In the constructor, read `JWT_SECRET` via `ConfigService`, **fail loudly** if missing
  (compute the secret *before* `super()` — legal since it doesn't touch `this`), and drop the
  `'change-me'` fallback:
  ```ts
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in the environment');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }
  ```
- Type the payload inline (interface declined by user) and return the enriched user:
  ```ts
  async validate(payload: { sub: string; email: string; role: UserRole }) {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
  ```
- Keep `@Injectable()` and the class name `JwtStrategy` (already referenced in `AuthModule`).

### 2. Add JWT env vars to all three env files (required prerequisite — "hors périmètre" config)
`.env.development`, `.env.test`, `.env.production` — add:
```
# JWT
JWT_SECRET=<per-env secret>
JWT_EXPIRATION=1h
```
- Dev/test: a clearly-labelled placeholder secret (e.g. `dev-change-me-...`).
- Prod: a placeholder the user MUST replace with a strong secret (call this out explicitly).
- `JWT_EXPIRATION=1h` matches the `StringValue` type `JwtModule` already expects.

### 3. `AuthModule` — no change
[src/modules/auth/auth.module.ts](../src/modules/auth/auth.module.ts) already satisfies every
integration point: `JwtStrategy` in `providers`, `PassportModule.register({ defaultStrategy: 'jwt' })`,
`JwtModule.registerAsync` injecting `ConfigService` (secret `JWT_SECRET`, `expiresIn` `JWT_EXPIRATION`),
and exports of `JwtModule` + `PassportModule` so guards elsewhere can use `AuthGuard('jwt')`.
Will re-read to confirm after edits; no edits expected.

## Files touched
- `src/modules/auth/strategies/jwt.strategy.ts` (rewrite)
- `.env.development`, `.env.test`, `.env.production` (add 2 vars each)

## Verification
1. **Compiles**: `npx tsc --noEmit` → 0 errors.
2. **Boots with the strategy active**: `npm run start:dev` starts cleanly (no
   `JWT_SECRET is not defined` throw, no DI errors), `AuthModule` initializes, app reaches
   "Nest application successfully started".
3. **Payload validation (lightweight, no committed test)**: with the app able to sign later,
   mint a token in a throwaway `node -e` using `jsonwebtoken` and the dev `JWT_SECRET`
   (`{ sub, email, role }`), then decode/verify to confirm the shape and that an expired token
   fails verification — demonstrating the same path `validate()` receives.

## Known limitation / natural next step
Full HTTP end-to-end proof (`Authorization: Bearer <token>` → guard → `req.user`) needs a
**protected route** and a **login endpoint that signs tokens** — both deliberately out of this
task's scope (`AuthService`/`AuthController` are still empty stubs). Recommended follow-up
tasks: (a) `JwtAuthGuard` + a protected `GET /auth/me`, (b) `AuthService.login()` signing
`{ sub, email, role }` via the injected `JwtService`. The strategy built here is the consumer
side those will plug into.
