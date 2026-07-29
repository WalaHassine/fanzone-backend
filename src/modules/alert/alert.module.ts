import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Import entities
import { AlertEntity } from './entities/alert.entity';

// Import services
import { AlertService } from './alert.service';

// Import controllers
import { AlertController } from './alert.controller';

// Import dependencies
import { UserModule } from '../user/user.module';
import { MatchModule } from '../match/match.module';

/**
 * Alert Module
 *
 * Responsibilities:
 * - Create alerts for favorite team matches
 * - Schedule alert delivery
 * - Trigger alerts at scheduled time
 * - Track alert status (PENDING, SENT, DISMISSED)
 * - User alert management
 *
 * Key Features:
 * - Scheduled polling to check for triggered alerts
 * - Alert time customization
 * - Status tracking
 * - MVP: In-app notifications
 * - Future: Email, push notifications
 *
 * Exports:
 * - AlertService: Used by other modules
 * - TypeOrmModule: For accessing entities
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Register AlertEntity
     * - Provides Repository<AlertEntity>
     */
    TypeOrmModule.forFeature([AlertEntity]),

    /**
     * Schedule Module
     * - For @Cron and @Interval decorators
     * - Used for alert polling service
     */
    ScheduleModule.forRoot(),

    /**
     * User Module
     * - Import to validate users
     * - Used for getting user info
     */
    UserModule,

    /**
     * Match Module
     * - Import to get match details
     * - Used for alert context
     */
    MatchModule,
  ],

  /**
   * Services provided by this module
   * - AlertService: Alert CRUD and triggering
   */
  providers: [AlertService],

  /**
   * Controllers for this module
   * - AlertController: Handles /alerts endpoints
   */
  controllers: [AlertController],

  /**
   * Exports
   * - AlertService: Can be used by other modules
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [AlertService, TypeOrmModule],
})
export class AlertModule {}
