import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Import entities
import { CheckinEntity } from './entities/checkin.entity';

// Import services
import { CheckinService } from './checkin.service';

// Import controllers
import { CheckinController } from './checkin.controller';

// Import dependencies
import { FanzoneModule } from '../fanzone/fanzone.module';
import { UserModule } from '../user/user.module';

/**
 * CheckIn Module
 * 
 * Responsibilities:
 * - Anonymous user check-in to fan zones
 * - Presence aggregation (no user IDs exposed)
 * - Session token generation (privacy-preserving)
 * - Crowd status queries
 * 
 * Key Privacy Feature:
 * - Stores userId in DB
 * - Returns sessionToken to client (never userId)
 * - Aggregates crowd by team (no individual data)
 * 
 * Exports:
 * - CheckinService: Used by FanzoneModule, AdminModule
 * - TypeOrmModule: For accessing entities
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Register CheckinEntity
     * - Provides Repository<CheckinEntity>
     */
    TypeOrmModule.forFeature([CheckinEntity]),

    /**
     * FanZone Module
     * - Import to validate fan zones
     * - Used for getting fan zone details
     */
    forwardRef(() => FanzoneModule),

    /**
     * User Module
     * - Import to validate users
     * - Used for getting user info
     */
    UserModule,
  ],

  /**
   * Services provided by this module
   * - CheckinService: Check-in and crowd aggregation
   */
  providers: [CheckinService],

  /**
   * Controllers for this module
   * - CheckinController: Handles /checkins endpoints
   */
  controllers: [CheckinController],

  /**
   * Exports
   * - CheckinService: Required by FanzoneModule, AdminModule
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [
    CheckinService,
    TypeOrmModule,
  ],
})
export class CheckinModule {}