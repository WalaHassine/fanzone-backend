import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

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
 * Note on scheduling: `AlertService.handlePendingAlerts` carries the `@Cron`
 * decorator, but `ScheduleModule.forRoot()` is **not** imported here — it lives
 * in `AppModule`, once. Two `forRoot()` calls (this module and `AdminModule`
 * both had one) can register the same job twice. Keeping it out also means a
 * spec that compiles this module alone gets no scheduler, so the decorator stays
 * inert and no timer starts during tests; `alert.module.spec.ts` asserts that.
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
