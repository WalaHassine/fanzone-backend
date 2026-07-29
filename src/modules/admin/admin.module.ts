import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Import entities
import { AdminStatisticEntity } from './entities/admin.entity';

// Import services
import { AdminService } from './admin.service';

// Import controllers
import { AdminController } from './admin.controller';

// Import dependencies
import { CheckinModule } from '../checkin/checkin.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { FanzoneModule } from '../fanzone/fanzone.module';

/**
 * Admin Module
 *
 * Responsibilities:
 * - Calculate daily statistics
 * - Aggregate check-in data
 * - Track recommendations
 * - Identify top fan zones
 * - Provide analytics dashboard
 *
 * Key Features:
 * - Daily aggregation job (runs at midnight)
 * - Historical statistics tracking
 * - Unique user counting
 * - Top fan zone identification
 * - Recommendation metrics
 *
 * Exports:
 * - AdminService: For querying statistics
 * - TypeOrmModule: For accessing entities
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Register AdminStatisticEntity
     * - Provides Repository<AdminStatisticEntity>
     */
    TypeOrmModule.forFeature([AdminStatisticEntity]),

    /**
     * Schedule Module
     * - For @Cron and @Interval decorators
     * - Used for daily aggregation job
     */
    ScheduleModule.forRoot(),

    /**
     * CheckIn Module
     * - Import to query check-in data
     * - Used for aggregating presence
     */
    CheckinModule,

    /**
     * Recommendation Module
     * - Import to query recommendation data
     * - Used for recommendation metrics
     */
    RecommendationModule,

    /**
     * FanZone Module
     * - Import to get fan zone details
     * - Used for identifying top fan zone
     */
    FanzoneModule,
  ],

  /**
   * Services provided by this module
   * - AdminService: Statistics calculation and queries
   */
  providers: [AdminService],

  /**
   * Controllers for this module
   * - AdminController: Handles /admin endpoints
   */
  controllers: [AdminController],

  /**
   * Exports
   * - AdminService: For querying stats
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [AdminService, TypeOrmModule],
})
export class AdminModule {}
