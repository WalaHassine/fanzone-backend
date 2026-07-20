import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from './entities/user.entity';

/**
 * UserService
 * User profile, preferences and favorite-team management.
 *
 * Only the lookups AuthService needs are implemented so far — profile,
 * preferences and favorite-team CRUD arrive with EF-03/EF-04/EF-05.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
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
}
