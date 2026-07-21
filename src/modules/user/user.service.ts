import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { UserEntity, UserRole } from './entities/user.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { UpdateUserPreferenceDto } from './dto/update-user-preference.dto';
import { UserResponseDto } from './dto/user-response.dto';

/**
 * UserService
 * User profile, preferences and favorite-team management.
 *
 * Backing logic for EF-03 (favourite teams), EF-04 (city/localisation) and
 * EF-05 (ambiance). The Team repository is reachable because UserModule imports
 * MatchModule, which re-exports its TypeOrmModule.forFeature([TeamEntity]).
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserPreferenceEntity)
    private readonly preferenceRepository: Repository<UserPreferenceEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
  ) {}

  /**
   * Looks a user up by email.
   *
   * The address is lowercased first: emails are stored normalized, so this
   * keeps the lookup aligned with the UNIQUE index on the column.
   */
  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  /**
   * Persists a new user with an already-hashed password.
   *
   * Takes `passwordHash`, never a plaintext password — hashing is the caller's
   * responsibility (AuthService), so a raw password cannot reach this layer.
   *
   * `preferences` is intentionally left unset: UserPreferenceEntity.city is
   * non-nullable and registration collects only email + password.
   */
  async createUser(email: string, passwordHash: string): Promise<UserEntity> {
    const user = this.userRepository.create({
      email: email.trim().toLowerCase(),
      passwordHash,
      role: UserRole.USER,
    });

    return this.userRepository.save(user);
  }

  /**
   * Loads a user with the relations needed to render a profile.
   *
   * `preferences` and `favoriteTeams` are already `eager` on the entity, but
   * they are requested explicitly here so this method stays correct even if the
   * eager flags are later removed.
   */
  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: { preferences: true, favoriteTeams: true },
    });
  }

  /**
   * Creates or partially updates a user's fan-zone preferences.
   *
   * Requirement: EF-04 (city/localisation), EF-05 (ambiance).
   *
   * Only the fields present on the DTO are written, so a caller can change one
   * without resetting the other. When no preferences row exists yet, one is
   * created — but `city` is non-nullable, so a first-time create without a city
   * is rejected up front rather than surfacing as a database constraint error.
   */
  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferenceDto,
  ): Promise<UserPreferenceEntity> {
    const existing = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (existing) {
      if (dto.city !== undefined) existing.city = dto.city;
      if (dto.favoriteAmbiance !== undefined) {
        existing.favoriteAmbiance = dto.favoriteAmbiance;
      }
      return this.preferenceRepository.save(existing);
    }

    if (dto.city === undefined) {
      throw new BadRequestException(
        'City is required when setting preferences for the first time',
      );
    }

    const created = this.preferenceRepository.create({
      userId,
      city: dto.city,
      ...(dto.favoriteAmbiance !== undefined
        ? { favoriteAmbiance: dto.favoriteAmbiance }
        : {}),
    });
    return this.preferenceRepository.save(created);
  }

  /**
   * Returns the public profile of a user.
   *
   * Projects the entity onto UserResponseDto — which has no `passwordHash`
   * field, so credential material cannot leak through this path. Favourite
   * teams are flattened to their names; `preferences` is `null` for a user who
   * has not set any yet.
   *
   * @throws NotFoundException if no user has this id.
   */
  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      favoriteTeams: (user.favoriteTeams ?? []).map((team) => team.name),
      preferences: user.preferences
        ? {
            city: user.preferences.city,
            favoriteAmbiance: user.preferences.favoriteAmbiance,
          }
        : (null as unknown as UserResponseDto['preferences']),
      createdAt: user.createdAt,
    };
  }

  /**
   * Replaces a user's set of favourite teams.
   *
   * Requirement: EF-03.
   *
   * Every id is resolved in a single `In(...)` query (no N+1), and all must
   * exist before anything is saved — a partially-valid list is rejected rather
   * than silently dropping the unknown ids. Assigning to the `cascade`d
   * `favoriteTeams` relation and saving the user rewrites the join table.
   *
   * @throws NotFoundException if the user or any of the teams does not exist.
   */
  async setFavoriteTeams(userId: string, teamIds: string[]): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const uniqueIds = [...new Set(teamIds)];
    const teams = await this.teamRepository.find({
      where: { id: In(uniqueIds) },
    });

    if (teams.length !== uniqueIds.length) {
      throw new NotFoundException('One or more teams not found');
    }

    user.favoriteTeams = teams;
    await this.userRepository.save(user);
  }
}
