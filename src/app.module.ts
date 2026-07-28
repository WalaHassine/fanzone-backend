import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';

// Import database configuration
import { TypeOrmConfigService } from './database/typeorm.config';

// Import configuration namespaces
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';

// Import all service modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { MatchModule } from './modules/match/match.module';
import { FanzoneModule } from './modules/fanzone/fanzone.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { AlertModule } from './modules/alert/alert.module';
import { AdminModule } from './modules/admin/admin.module';

// Import global filters, pipes, interceptors

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './common/filters/interceptors/loggin.interceptor';

// Import controllers
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Root Application Module
 *
 * This module:
 * - Configures environment variables
 * - Sets up database connection
 * - Imports all feature modules
 * - Registers global middleware/pipes/filters
 * - Exports core services
 */
@Module({
  imports: [
    /**
     * Configuration Module
     * - Loads environment variables from .env file
     * - Makes ConfigService available globally
     * - Registers typed namespaces: `app.*` and `jwt.*`
     */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      cache: true,
      expandVariables: true,
      load: [appConfig, jwtConfig],
    }),

    /**
     * Database Module
     * - Connects to PostgreSQL
     * - Auto-syncs entities in development
     * - Lazy-loads migrations
     */
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useClass: TypeOrmConfigService,
    }),

    /**
     * Feature Modules
     * Each module handles its specific domain:
     *
     * Auth: Registration, login, JWT tokens
     * User: Profile management, preferences
     * Match: FIFA World Cup matches
     * FanZone: Viewing venues, crowd aggregation
     * CheckIn: Anonymous presence tracking
     * Recommendation: AI-powered suggestions
     * Alert: Match notifications
     * Admin: Statistics and analytics
     */
    AuthModule,
    UserModule,
    MatchModule,
    FanzoneModule,
    CheckinModule,
    RecommendationModule,
    AlertModule,
    AdminModule,
  ],

  /**
   * Global Controllers
   * - AppController: Health check, root endpoint
   */
  controllers: [AppController],

  /**
   * Global Providers
   * - AppService: Core application logic
   * - Global Filters: Exception handling
   * - Global Pipes: Input validation
   * - Global Interceptors: Request logging
   */
  providers: [
    AppService,

    /**
     * Global HTTP Exception Filter
     * - Catches HttpException and converts to consistent format
     * - Logs errors appropriately
     * - Returns user-friendly error messages
     */
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    /**
     * Global Validation Pipe
     * - Validates DTO inputs
     * - Transforms payload to DTO class instances
     * - Removes unknown properties (whitelist: true)
     * - Forbids non-whitelisted properties
     */
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        stopAtFirstError: false,
      }),
    },

    /**
     * Global Logging Interceptor
     * - Logs all incoming requests
     * - Logs response times
     * - Logs errors
     */
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {
  /**
   * Constructor runs on module initialization
   * - Log that app is starting
   * - Could verify critical services
   */
  constructor(private configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    const port = this.configService.get<number>('APP_PORT') || 3000;
    const database =
      this.configService.get<string>('DATABASE_NAME') ?? 'unknown';

    console.log(`
    ╔═════════════════════════════════════════════════════════╗
    ║  World Cup FanZone AI Backend                           ║
    ║  Environment: ${nodeEnv.toUpperCase().padEnd(36)} ║
    ║  Listening on port: ${port.toString().padEnd(35)} ║
    ║  Database: ${database.padEnd(42)} ║
    ╚═════════════════════════════════════════════════════════╝
    `);
  }
}
