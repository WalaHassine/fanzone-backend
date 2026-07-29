import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Import entities
import { FanzoneEntity } from './entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { CheckinEntity } from '../checkin/entities/checkin.entity';

// Import services
import { FanzoneService } from './fanzone.service';

// Import controllers
import { FanzoneController } from './fanzone.controller';

// Import CheckIn module (for crowd aggregation queries)
import { CheckinModule } from '../checkin/checkin.module';

/**
 * FanZone Module
 *
 * Responsibilities:
 * - Fan zone management (viewing venues)
 * - Geographic data handling (latitude, longitude)
 * - Crowd status aggregation (anonymous)
 * - Distance filtering (requires PostGIS)
 * - Fan zone availability tracking
 *
 * Exports:
 * - FanzoneService: Used by RecommendationModule, CheckinModule
 * - TypeOrmModule: For accessing entities
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Register FanzoneEntity, plus TeamEntity and CheckinEntity
     * - Provides Repository<FanzoneEntity>, Repository<TeamEntity>,
     *   Repository<CheckinEntity>
     *
     * FanzoneService needs all three: teams to validate `teamIds` and to write
     * the `fanzone_teams` join rows, check-ins to aggregate crowd status.
     * They are registered here rather than taken from CheckinModule's and
     * MatchModule's re-exported TypeOrmModule so repository resolution does not
     * depend on the forwardRef cycle below.
     */
    TypeOrmModule.forFeature([FanzoneEntity, TeamEntity, CheckinEntity]),

    /**
     * CheckIn Module
     * - Import to access CheckinEntity for crowd aggregation
     * - Used in getCrowdStatus() method
     */
    forwardRef(() => CheckinModule),
  ],

  /**
   * Services provided by this module
   * - FanzoneService: Fan zone CRUD and crowd aggregation
   */
  providers: [FanzoneService],

  /**
   * Controllers for this module
   * - FanzoneController: Handles /fanzones endpoints
   */
  controllers: [FanzoneController],

  /**
   * Exports
   * - FanzoneService: Required by RecommendationModule, CheckinModule
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [FanzoneService, TypeOrmModule],
})
export class FanzoneModule {}
