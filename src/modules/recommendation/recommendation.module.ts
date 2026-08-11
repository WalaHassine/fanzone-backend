import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Import entities
import { RecommendationEntity } from './entities/recommendation.entity';
import { UserEntity } from '../user/entities/user.entity';
import { MatchEntity } from '../match/entities/match.entity';
import { AlertEntity } from '../alert/entities/alert.entity';

// Import services
import { RecommendationService } from './recommendation.service';
import { AiService } from './services/ai.service';

// Import controllers
import { RecommendationController } from './recommendation.controller';

// Import dependencies
import { UserModule } from '../user/user.module';
import { MatchModule } from '../match/match.module';
import { FanzoneModule } from '../fanzone/fanzone.module';
import { CheckinModule } from '../checkin/checkin.module';

/**
 * Recommendation Module
 *
 * Responsibilities:
 * - AI-powered fan zone recommendations
 * - Natural language explanations
 * - Alert suggestions
 * - Auto-generate fan zone descriptions
 *
 * Key Features:
 * - Integration with the Groq API (see AiService)
 * - Personalized recommendations based on:
 *   - User's favorite teams
 *   - User's ambiance preference
 *   - User's location
 *   - Crowd status at fan zones
 *   - Upcoming matches
 * - <3 second response time
 * - Confidence scoring (0-1)
 *
 * Exports:
 * - RecommendationService: Used by other modules
 * - TypeOrmModule: For accessing entities
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Registers RecommendationEntity plus the three entities the service
     *   reads directly: UserEntity (profile + preferences), MatchEntity
     *   (fixture and teams) and AlertEntity.
     * - AlertEntity is registered here rather than reached through AlertModule:
     *   `suggestAlerts` only needs to know whether an alert already exists, and
     *   AlertService is still a stub. Importing that module would also invite a
     *   cycle, since alerts are about users and matches.
     * - FanzoneEntity is deliberately absent — every fan zone read goes through
     *   FanzoneService, so the PostGIS distance expression and the occupancy
     *   formula each live in exactly one place.
     */
    TypeOrmModule.forFeature([
      RecommendationEntity,
      UserEntity,
      MatchEntity,
      AlertEntity,
    ]),

    /**
     * User Module
     * - Import to get user profiles
     * - Used for personalization
     */
    UserModule,

    /**
     * Match Module
     * - Import to get upcoming matches
     * - Used for recommendations
     */
    MatchModule,

    /**
     * FanZone Module
     * - Import to get fan zones and details
     * - Used for enriching recommendations
     */
    FanzoneModule,

    /**
     * CheckIn Module
     * - Import to get crowd status
     * - Used for considering crowding in recommendations
     */
    CheckinModule,
  ],

  /**
   * Services provided by this module
   * - RecommendationService: Main recommendation logic
   * - AiService: Groq API integration
   */
  providers: [RecommendationService, AiService],

  /**
   * Controllers for this module
   * - RecommendationController: Handles /recommendations endpoints
   */
  controllers: [RecommendationController],

  /**
   * Exports
   * - RecommendationService: Can be used by other modules if needed
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [RecommendationService, TypeOrmModule],
})
export class RecommendationModule {}
