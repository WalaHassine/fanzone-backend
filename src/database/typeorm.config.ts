import { DataSource } from 'typeorm';
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
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';

    return {
      type: 'postgres',
      host: this.configService.get<string>('DATABASE_HOST') || 'localhost',
      port: this.configService.get<number>('DATABASE_PORT') || 5432,
      database: this.configService.get<string>('DATABASE_NAME') || 'fanzoneai_db',
      username: this.configService.get<string>('DATABASE_USER') || 'postgres',
      password: this.configService.get<string>('DATABASE_PASSWORD') || 'password',
      
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

      // Migrations
      migrations: ['src/database/migrations/*.ts'],
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

  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',

  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});