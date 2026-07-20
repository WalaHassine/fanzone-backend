import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { UserService } from '../user/user.service';
import { UserEntity, UserRole } from '../user/entities/user.entity';
import { AuthResponseDto, LoginDto, RegisterDto } from './dto';

/** bcrypt cost factor used for every password hashed by this service. */
export const SALT_ROUNDS = 10;

/** Shape signed into every access token. Consumed by JwtStrategy.validate(). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/**
 * AuthService
 * Handles registration, login and JWT token generation.
 *
 * Requirements: EF-01 (registration), EF-02 (secure authentication),
 * ENF-03 (passwords stored bcrypt-hashed).
 *
 * Neither public method returns a UserEntity, so `passwordHash` cannot reach
 * an HTTP response by construction.
 */
@Injectable()
export class AuthService {
  /**
   * Pre-computed hash of a throwaway string, compared against when no user
   * matches the submitted email. Without it, login would answer far faster for
   * unknown addresses than for known ones, letting an attacker enumerate
   * registered users by response time alone.
   *
   * Computed once at construction — not per request.
   */
  private readonly dummyHash: string = bcrypt.hashSync(
    'timing-attack-placeholder',
    SALT_ROUNDS,
  );

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registers a new account and returns credentials for immediate use.
   *
   * Requirement: EF-01 — "créer un compte via email et mot de passe".
   *
   * @throws BadRequestException if the email is already registered.
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.userService.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.userService.createUser(email, passwordHash);

    return this.generateTokens(user);
  }

  /**
   * Authenticates an existing account.
   *
   * Requirement: EF-02 — "s'authentifier de manière sécurisée (JWT)".
   *
   * Both failure modes — unknown email and wrong password — throw the same
   * exception with the same message, and both run a bcrypt comparison, so
   * neither the response body nor its timing reveals whether an email exists.
   *
   * @throws UnauthorizedException if the credentials do not match.
   */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userService.findByEmail(email);

    // Always compared, even when there is no user, to keep both paths
    // equally expensive.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? this.dummyHash,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  /**
   * Signs an access token for a user.
   *
   * The payload shape `{ sub, email, role }` is a contract with
   * JwtStrategy.validate() — changing it there without changing it here leaves
   * `req.user.role` undefined on every request.
   *
   * `expiresIn` is not passed to sign(): JwtModule is already configured with
   * `signOptions.expiresIn`, and setting it in both places invites drift
   * between the real token lifetime and the one reported to the client.
   */
  private generateTokens(user: UserEntity): AuthResponseDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      expiresIn: this.configService.get<number>('jwt.expiresInSeconds')!,
      tokenType: 'Bearer',
    };
  }
}
