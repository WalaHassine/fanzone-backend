import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

// Import entities
import { UserEntity } from '../user/entities/user.entity';

// Import services and strategies
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

// Import controllers
import { AuthController } from './auth.controller';

// Import User Module (needed for dependency)
import { UserModule } from '../user/user.module';

/**
 * Authentication Module
 *
 * Responsibilities:
 * - User registration with password hashing
 * - User login with JWT token generation
 * - JWT token validation via Passport
 * - Protection of routes requiring authentication
 *
 * Exports:
 * - AuthService: Available to other modules
 * - JwtModule: For JWT strategies
 */
@Module({
  imports: [
    /**
     * TypeORM Module
     * - Register UserEntity for this module
     * - Provides Repository<UserEntity> injection
     */
    TypeOrmModule.forFeature([UserEntity]),

    /**
     * Passport Module
     * - Provides @UseGuards(AuthGuard('jwt'))
     * - Enables JWT validation
     */
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    /**
     * JWT Module
     * - Async registration to inject ConfigService
     * - Reads from the `jwt` config namespace (src/config/jwt.config.ts),
     *   which is the single owner of JWT_SECRET / JWT_EXPIRATION
     */
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiration'),
        } as JwtSignOptions,
      }),
    }),

    /**
     * User Module
     * - Import to use UserService in AuthService
     * - Provides user creation and retrieval
     */
    UserModule,
  ],

  /**
   * Services provided by this module
   * - AuthService: Main authentication logic
   * - JwtStrategy: Passport strategy for JWT validation
   */
  providers: [AuthService, JwtStrategy],

  /**
   * Controllers for this module
   * - AuthController: Handles /auth endpoints
   */
  controllers: [AuthController],

  /**
   * Exports
   * - AuthService: Available to other modules (UserModule, etc.)
   * - JwtModule: For using JWT in other modules
   * - PassportModule: For using @UseGuards(JwtAuthGuard) in other modules
   */
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
