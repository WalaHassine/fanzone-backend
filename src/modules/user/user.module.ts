import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Import entities
import { UserEntity } from './entities/user.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';

// Import services
import { UserService } from './user.service';

// Import controllers
import { UserController } from './user.controller';

// Import Match Module (for favorite teams which are Teams)
import { MatchModule } from '../match/match.module';

/**
 * User Module
 * 
 * Responsibilities:
 * - User profile management
 * - User preferences (city, ambiance)
 * - Favorite teams management
 * - User query by email or ID
 * 
 * Exports:
 * - UserService: Used by AuthModule, other modules
 * - TypeOrmModule: For accessing entities
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Register UserEntity and UserPreferenceEntity
     * - Provides Repository<UserEntity> and Repository<UserPreferenceEntity>
     */
    TypeOrmModule.forFeature([UserEntity, UserPreferenceEntity]),

    /**
     * Match Module
     * - Import to access TeamEntity (for favorite teams)
     * - Provides Team repository
     */
    MatchModule,
  ],

  /**
   * Services provided by this module
   * - UserService: User CRUD and preference management
   */
  providers: [UserService],

  /**
   * Controllers for this module
   * - UserController: Handles /users endpoints
   */
  controllers: [UserController],

  /**
   * Exports
   * - UserService: Required by AuthModule for user creation
   * - TypeOrmModule: For using entities in other modules
   */
  exports: [
    UserService,
    TypeOrmModule,
  ],
})
export class UserModule {}