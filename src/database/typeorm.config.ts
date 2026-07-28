import { join } from 'path';

import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
// Import all entities
import { UserEntity } from '../modules/user/entities/user.entity';
import { UserPreferenceEntity } from '../modules/user/entities/user-preference.entity';
import { TeamEntity } from '../modules/match/entities/team.entity';
import { MatchEntity } from '../modules/match/entities/match.entity';
import { FanzoneEntity } from '../modules/fanzone/entities/fanzone.entity';
import { CheckinEntity } from '../modules/checkin/entities/checkin.entity';
import { RecommendationEntity } from '../modules/recommendation/entities/recommendation.entity';
import { AlertEntity } from '../modules/alert/entities/alert.entity';
import { AdminStatisticEntity } from '../modules/admin/entities/admin.entity';

/**
 * Glob matching the migration files of whichever build is running.
 *
 * Resolved from this module's own location rather than the working directory, so
 * it follows the code: `src/database/migrations/*.ts` under ts-node and the
 * TypeORM CLI, `dist/src/database/migrations/*.js` under `nest start`. The
 * previous hardcoded `src/**\/*.ts` path made the compiled app load the
 * TypeScript sources, which Node 22 treats as ESM — the named `typeorm` imports
 * then fail with "does not provide an export named 'MigrationInterface'".
 *
 * The extension is pinned to exactly one value instead of a `*{.ts,.js}`
 * alternation: `nest build` emits declaration files alongside the JavaScript,
 * and `.d.ts` matches a `.ts` pattern — loading one would resurface the same
 * error.
 */
const MIGRATIONS_GLOB = join(
  __dirname,
  'migrations',
  __filename.endsWith('.ts') ? '*.ts' : '*.js',
);

/**
 * TypeORM Configuration for World Cup FanZone Platform
 *
 * This configuration handles:
 * - Database connection
 * - Entity auto-sync
 * - Migrations
 * - Logging
 * - SSL in production
 */
@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';

    return {
      type: 'postgres',
      host: this.configService.get<string>('DATABASE_HOST') || 'localhost',
      port: this.configService.get<number>('DATABASE_PORT') || 5432,
      database:
        this.configService.get<string>('DATABASE_NAME') || 'fanzoneai_db',
      username: this.configService.get<string>('DATABASE_USER') || 'postgres',
      password:
        this.configService.get<string>('DATABASE_PASSWORD') || 'password',

      // Entities
      entities: [
        UserEntity,
        UserPreferenceEntity,
        TeamEntity,
        MatchEntity,
        FanzoneEntity,
        CheckinEntity,
        RecommendationEntity,
        AlertEntity,
        AdminStatisticEntity,
      ],

      // Migrations — see MIGRATIONS_GLOB.
      migrations: [MIGRATIONS_GLOB],
      migrationsTableName: 'typeorm_migrations',

      // Development: Auto-sync schema on startup
      // Production: Use migrations only
      synchronize: isDevelopment,

      // Logging
      logging: isDevelopment,
      logger: isDevelopment ? 'advanced-console' : 'file',

      // SSL for production
      ssl: isProduction ? { rejectUnauthorized: false } : false,

      // Connection pool
      extra: {
        max: isProduction ? 20 : 10,
        min: 2,
        idle_in_transaction_session_timeout: 10000,
      },

      // Retry logic
      connectTimeoutMS: 20000,
      maxQueryExecutionTime: isProduction ? 10000 : 0,
    };
  }
}

/**
 * The TypeORM CLI runs outside Nest, so ConfigModule never loads the env file
 * and `process.env.DATABASE_*` would be empty — every value below would silently
 * fall back to its default and authentication would fail. Load the same file
 * ConfigModule uses (`envFilePath` in AppModule) before building the DataSource.
 *
 * Harmless inside the running app: dotenv does not overwrite variables that are
 * already set, and ConfigModule reads the file itself regardless.
 */
loadEnv({ path: `.env.${process.env.NODE_ENV || 'development'}`, quiet: true });

/**
 * DataSource for CLI commands (migrations)
 * Usage: npx typeorm migration:generate -d src/database/typeorm.config.ts
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'fanzoneai_db',
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'password',

  entities: [
    UserEntity,
    UserPreferenceEntity,
    TeamEntity,
    MatchEntity,
    FanzoneEntity,
    CheckinEntity,
    RecommendationEntity,
    AlertEntity,
    AdminStatisticEntity,
  ],

  migrations: [MIGRATIONS_GLOB],
  migrationsTableName: 'typeorm_migrations',

  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});
