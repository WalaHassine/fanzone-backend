import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Import entities
import { TeamEntity } from './entities/team.entity';
import { MatchEntity } from './entities/match.entity';

// Import services
import { MatchService } from './services/match.service';
import { TeamService } from './services/team.service';

// Import controllers
import { MatchController } from './controllers/match.controller';
import { TeamController } from './controllers/team.controller';

/**
 * Match Module
 * 
 * Responsibilities:
 * - Team management (FIFA World Cup teams)
 * - Match management (World Cup matches)
 * - Match filtering by team, date, status
 * - Team CRUD operations
 * 
 * Exports:
 * - MatchService: Used by RecommendationModule, AlertModule
 * - TeamService: Used by other modules for team data
 * - TypeOrmModule: For accessing entities
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Register TeamEntity and MatchEntity
     * - Provides Repository<TeamEntity> and Repository<MatchEntity>
     */
    TypeOrmModule.forFeature([TeamEntity, MatchEntity]),
  ],

  /**
   * Services provided by this module
   * - MatchService: Match CRUD and filtering
   * - TeamService: Team CRUD operations
   */
  providers: [
    MatchService,
    TeamService,
  ],

  /**
   * Controllers for this module
   * - MatchController: Handles /matches endpoints
   * - TeamController: Handles /teams endpoints (optional)
   */
  controllers: [
    MatchController,
    TeamController,
  ],

  /**
   * Exports
   * - MatchService: Required by RecommendationModule, AlertModule
   * - TeamService: Required by UserModule (favorite teams)
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [
    MatchService,
    TeamService,
    TypeOrmModule,
  ],
})
export class MatchModule {}