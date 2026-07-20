# Auth DTOs & Validation

## Context

The auth module (`src/modules/auth/`) is scaffolded but hollow: `AuthService` and `AuthController` are empty stubs, and there is **no `dto/` directory anywhere in the project** — this task establishes the DTO convention for the whole codebase.

The infrastructure is already in place and does not need changing:
- `class-validator` `^0.15.1`, `class-transformer` `^0.5.1`, `@nestjs/swagger` `^11.4.5`, `bcrypt` `^6.0.0` are installed.
- A **global `ValidationPipe` is already registered** in [app.module.ts](../src/app.module.ts) via `APP_PIPE` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `enableImplicitConversion: true`. So DTO validation fires automatically once the DTOs are typed on controller params — no pipe work needed.
- [jwt.strategy.ts](../src/modules/auth/strategies/jwt.strategy.ts) already fixes the token payload contract: `{ sub, email, role }`.

**Requirements traceability** — [design-document.md](design-document.md), §7:
- **EF-01** (Haute) — "créer un compte via email et mot de passe" → verified by "Compte créé et persisté en base". Confirms `RegisterDto` = email + password only.
- **EF-02** (Haute) — "s'authentifier de manière sécurisée (JWT)" → "Connexion réussie retourne un token valide".
- **ENF-07** (Fiabilité) — "gérer les erreurs de saisie sans interruption de service" → satisfied by the global `ValidationPipe` + `HttpExceptionFilter` returning structured 400s.
- **ENF-03** (Sécurité) — bcrypt hashing; already a dependency, consumed in the follow-up service task.

Two gaps block the stated acceptance criteria and are in scope:
1. **Swagger is never bootstrapped.** `@nestjs/swagger` is a dependency but [main.ts](../src/main.ts) is 8 lines with no `DocumentBuilder`/`SwaggerModule`. "Swagger documentation shows validation rules" is unachievable without it.
2. **`expiresIn` must be a number of seconds**, but `JWT_EXPIRATION=1h` (a string) in all three env files.

Intended outcome: registration rejects weak passwords, login accepts any ≥8-char password, and the auth response conforms to the OAuth2 bearer shape (`accessToken` / `expiresIn` / `tokenType`), all documented in Swagger.

---

## Decisions taken

- `RegisterDto` accepts **email + password only**. `UserPreferenceEntity` (city, ambiance) and `favoriteTeams` are deferred to a later profile endpoint.
- `JWT_EXPIRATION` **stays as the human-readable `1h`** in env. The seconds value is derived once at config load in a new `jwt.config.ts` namespace. Rationale: `JwtModule` consumes the duration string natively, and "seconds" is an API-contract concern (OAuth2 response shape), not a configuration concern.
- `AuthResponseDto` carries exactly the three specified fields — no nested `user` object.
- **No refresh token.** The design doc's class diagram declares `AuthController.refreshToken(token): AuthResponse`, but refresh tokens appear in **no** functional requirement (EF-01…EF-21) and have **no** table in the ER schema. Treated as aspirational; deferred until the storage/rotation model is designed.
- Naming: the doc writes `RegisterDTO`; we use `RegisterDto` / `register.dto.ts` per standard NestJS convention. No existing DTOs constrain this.

---

## Files to create

### 1. `src/config/jwt.config.ts` (new)

`registerAs('jwt', ...)` exposing three values, so `JWT_SECRET`/`JWT_EXPIRATION` have a single typed owner instead of being read via raw `configService.get('JWT_SECRET')` in scattered places:

```ts
secret            // for signing
expiration        // '1h' — passed to JwtModule.signOptions
expiresInSeconds  // 3600 — populates AuthResponseDto.expiresIn
```

Include a small local `parseDurationToSeconds(d: string): number` supporting `s|m|h|d` suffixes and bare-number input. Deliberately **no new `ms` dependency** for ~10 lines. Throw on an unparseable value so a bad env fails fast at boot rather than silently serving a wrong `expiresIn`.

### 2. `src/modules/auth/dto/register.dto.ts` (new)

`email` — `@IsEmail()`, `@IsNotEmpty()`, `@ApiProperty()`.

`password` — `@IsString()`, `@MinLength(8)`, plus `@Matches()` with:

```
/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/
```

with an explicit `{ message: 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character (@$!%*?&)' }`.

> Decision: the trailing `.{8,}` is deliberate — it **requires** one of `@$!%*?&` without **restricting** the alphabet to that set. A password containing `#`, `-`, `_` or a space is accepted as long as it also satisfies the four lookaheads. This avoids silently rejecting password-manager-generated credentials, which the stricter `[A-Za-z\d@$!%*?&]{8,}` variant would do.

### 3. `src/modules/auth/dto/login.dto.ts` (new)

`email` — `@IsEmail()`. `password` — `@IsString()`, `@MinLength(8)`. **No `@Matches`** — existing users with legacy passwords must still be able to log in. Do *not* implement via `PickType(RegisterDto)`, since that would inherit the strength regex.

### 4. `src/modules/auth/dto/auth-response.dto.ts` (new)

Plain response class, `@ApiProperty` only (no validators — it is never an input):

```ts
accessToken: string   // JWT
expiresIn: number     // seconds, from jwt.expiresInSeconds
tokenType: string     // always 'Bearer'
```

### 5. `src/modules/auth/dto/index.ts` (new)

Barrel export. Note `tsconfig.json` uses `nodenext` + `isolatedModules`, so any type-only re-export needs `export type { ... }`.

---

## Files to modify

- **[src/app.module.ts](../src/app.module.ts)** — add `load: [appConfig, jwtConfig]` to `ConfigModule.forRoot`. This also fixes an existing defect: `src/config/app.config.ts` is written but registered nowhere, i.e. currently dead code.
- **[src/modules/auth/auth.module.ts](../src/modules/auth/auth.module.ts)** — switch `JwtModule.registerAsync` from `config.get('JWT_SECRET')` / `config.get('JWT_EXPIRATION')` to `config.get('jwt.secret')` / `config.get('jwt.expiration')`.
- **[src/main.ts](../src/main.ts)** — add `DocumentBuilder` (title, description, version, `.addBearerAuth()`) + `SwaggerModule.setup('api/docs', ...)`. Gate it behind a non-production check.

## Conventions to follow

Match the existing codebase style seen in [user.entity.ts](../src/modules/user/entities/user.entity.ts):
- JSDoc block comments above each class and property. Tag the DTOs with the requirement IDs — `RegisterDto` → EF-01, `LoginDto`/`AuthResponseDto` → EF-02.
- **`!` definite-assignment assertions on every property.** `tsconfig.json` has `strict: true`, which implies `strictPropertyInitialization`; DTO fields will not compile without `!`.
- Every accepted property needs ≥1 class-validator decorator, because `forbidNonWhitelisted: true` rejects any property the pipe doesn't recognize.

## Out of scope

`AuthService.register()`/`login()` and the controller routes remain stubs. The DTOs are consumed in a follow-up task — which is why the verification below is compile/unit-level, not endpoint-level.

---

## Verification

> **We run this together.** After implementation I stop and we walk through these steps side by side — I do not mark the task done on my own. Same for every future task.

1. `npm run build` — all DTOs compile clean (catches missing `!` assertions).
2. `npx ts-node` scratch script (or a Jest spec) calling `plainToInstance` + `validate` on `RegisterDto`, asserting:
   - `Passw0rd!` → passes
   - `password` → fails (no upper, no digit, no special)
   - `Passw0rd` → fails (no special char)
   - `Pass0!` → fails `@MinLength(8)`
   - `not-an-email` → fails `@IsEmail`
   - same weak passwords → **pass** on `LoginDto` (only length enforced)
3. `parseDurationToSeconds('1h') === 3600`; assert boot fails on a garbage `JWT_EXPIRATION`.
4. `npm run start:dev`, open `http://localhost:3000/api/docs` — confirm the app still boots after the `jwt.config` refactor and that Swagger renders. Full DTO schemas only appear once a controller route references them, so expect the page to be sparse until the follow-up task.

---

## Noted, not addressed here

- `.env.development` / `.env.test` / `.env.production` are committed to git with real DB passwords, and `.env.production` still carries a placeholder `JWT_SECRET`. Unrelated to this task, but worth a dedicated fix.
- The doc's ER diagram places `city` and the ambiance enum directly on the `users` table, whereas the code has a separate `UserPreferenceEntity` (eager + cascade). A deliberate-looking divergence; relevant to the EF-04/EF-05 profile task, not this one.
