import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Import entities
import { CheckinEntity } from './entities/checkin.entity';
import { FanzoneEntity } from '../fanzone/entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';

// Import services
import { CheckinService } from './checkin.service';

// Import controllers
import { CheckinController } from './checkin.controller';
import { UserCheckinsController } from './user-checkins.controller';

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
     * - Register CheckinEntity, plus FanzoneEntity and TeamEntity
     * - Provides Repository<CheckinEntity>, Repository<FanzoneEntity>,
     *   Repository<TeamEntity>
     *
     * CheckinService needs all three: the fan zone to check capacity and the
     * broadcast team set, the team to validate `teamId`. They are registered
     * here rather than taken from FanzoneModule's re-exported TypeOrmModule so
     * repository resolution does not depend on the forwardRef cycle below —
     * mirroring what FanzoneModule does for CheckinEntity.
     */
    TypeOrmModule.forFeature([CheckinEntity, FanzoneEntity, TeamEntity]),

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
   * - UserCheckinsController: Handles GET /users/checkins
   *
   * The second one carries a `/users` prefix but lives here, not in UserModule:
   * the route returns check-in data through CheckinService, and hanging it off
   * UserController would make UserModule import CheckinModule while
   * CheckinModule already imports UserModule — a cycle for one route. Nest
   * routes two controllers under the same prefix without complaint.
   */
  controllers: [CheckinController, UserCheckinsController],

  /**
   * Exports
   * - CheckinService: Required by FanzoneModule, AdminModule
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [CheckinService, TypeOrmModule],
})
export class CheckinModule {}
