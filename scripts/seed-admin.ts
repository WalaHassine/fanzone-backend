/**
 * scripts/seed-admin.ts
 *
 * Provisions the platform's single admin account out-of-band, so no public HTTP
 * path can ever mint an ADMIN. The seeded admin then authenticates through the
 * unchanged `POST /auth/login` to obtain a JWT carrying `role: ADMIN`.
 *
 * Run with:  npm run seed:admin
 *
 * Required env (from `.env.${NODE_ENV}`, default `.env.development`):
 *   ADMIN_EMAIL     — email for the admin account
 *   ADMIN_PASSWORD  — plaintext password; must satisfy PASSWORD_PATTERN
 *
 * The script is idempotent: re-running with the same email promotes/leaves the
 * existing account rather than creating a duplicate.
 */
import { config as loadEnv } from 'dotenv';

// Load the same env file the Nest app uses, BEFORE importing AppDataSource —
// its connection options are read from process.env at module-evaluation time.
const NODE_ENV = process.env.NODE_ENV || 'development';
loadEnv({ path: `.env.${NODE_ENV}` });

import * as bcrypt from 'bcrypt';

import { AppDataSource } from '../src/database/typeorm.config';
import { UserEntity, UserRole } from '../src/modules/user/entities/user.entity';
// Reuse the exact cost factor the login path hashes with, so bcrypt.compare at
// login always succeeds — importing it means the two can never drift.
import { SALT_ROUNDS } from '../src/modules/auth/auth.service';
// Reuse the registration password policy so a weak ADMIN_PASSWORD is rejected
// here with the same rule the public /auth/register enforces.
import {
  PASSWORD_PATTERN,
  PASSWORD_MESSAGE,
} from '../src/modules/auth/dto/register.dto';

/** Print an error and exit non-zero. Never echoes the password. */
function fail(message: string): never {
  console.error(`✖ seed:admin — ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // 1. Required credentials — no hardcoded fallback, fail loudly.
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';

  if (!email) fail('ADMIN_EMAIL is not set.');
  if (!password) fail('ADMIN_PASSWORD is not set.');

  // 2. Enforce the registration password policy before hashing.
  if (!PASSWORD_PATTERN.test(password)) {
    fail(`ADMIN_PASSWORD is too weak. ${PASSWORD_MESSAGE}`);
  }

  // 3. Environment guard. Outside development, require an explicit confirmation
  //    so nobody seeds a real database by accident. The unsafe AppDataSource
  //    defaults (postgres/password) are also refused — they signal that DB env
  //    vars were never provided.
  const dbUser = process.env.DATABASE_USER || 'postgres';
  const dbPassword = process.env.DATABASE_PASSWORD || 'password';
  if (dbUser === 'postgres' && dbPassword === 'password') {
    fail(
      'Refusing to run against the default DB credentials (postgres/password). ' +
        'Set DATABASE_USER / DATABASE_PASSWORD.',
    );
  }
  if (NODE_ENV !== 'development' && !process.env.SEED_CONFIRM) {
    fail(
      `NODE_ENV is "${NODE_ENV}". Re-run with SEED_CONFIRM=1 to seed a ` +
        'non-development database.',
    );
  }

  // 4. Connect and resolve the users repository.
  await AppDataSource.initialize();
  try {
    const users = AppDataSource.getRepository(UserEntity);

    // 5. Idempotency — if the account already exists, promote or skip.
    const existing = await users.findOne({ where: { email } });
    if (existing) {
      if (existing.role === UserRole.ADMIN) {
        console.log(
          `✓ Admin already exists (id=${existing.id}, email=${existing.email}) — skipping.`,
        );
        return;
      }
      existing.role = UserRole.ADMIN;
      await users.save(existing);
      console.log(
        `✓ Promoted existing user to ADMIN (id=${existing.id}, email=${existing.email}).`,
      );
      return;
    }

    // 6. Create the admin. bcrypt via the shared SALT_ROUNDS. preferences left
    //    unset — getProfile tolerates a null preference.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = users.create({
      email,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    });
    const saved = await users.save(admin);

    // 7. Never log the password.
    console.log(
      `✓ Created admin (id=${saved.id}, email=${saved.email}, role=${saved.role}).`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('✖ seed:admin — unexpected error:', err);
  process.exit(1);
});
