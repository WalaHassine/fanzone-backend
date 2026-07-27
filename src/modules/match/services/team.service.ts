import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TeamEntity } from '../entities/team.entity';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';

/**
 * TeamService
 *
 * Team CRUD. Teams are the entities that matches, favourites, fanzones and
 * check-ins all reference, so writes are admin-only and reads are public.
 *
 * Uniqueness of `name` and `code` is enforced here rather than relying solely
 * on the database constraints: the service is consumed directly by other
 * modules, and a pre-check yields a 400 with a readable message instead of a
 * driver-level constraint error. The unique indexes remain the backstop.
 *
 * There is no delete: teams are referenced by matches and removing one would
 * orphan fixtures.
 */
@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
  ) {}

  /**
   * Creates a new team (admin-only).
   *
   * @throws {BadRequestException} if the name or code is already taken.
   */
  async create(dto: CreateTeamDto): Promise<TeamEntity> {
    if (await this.findByName(dto.name)) {
      throw new BadRequestException('Team name already exists');
    }
    if (await this.findByCode(dto.code)) {
      throw new BadRequestException('Team code already exists');
    }

    const team = this.teamRepository.create({
      name: dto.name,
      code: dto.code,
      flag: dto.flag,
    });

    return this.teamRepository.save(team);
  }

  /**
   * Lists every team, ordered alphabetically by name.
   */
  async findAll(): Promise<TeamEntity[]> {
    return this.teamRepository.find({ order: { name: 'ASC' } });
  }

  /**
   * Fetches a single team.
   *
   * @returns the team, or `null` if no team has the given id.
   */
  async findById(id: string): Promise<TeamEntity | null> {
    return this.teamRepository.findOne({ where: { id } });
  }

  /**
   * Looks a team up by name, case-insensitively — "france" must collide with an
   * existing "France" rather than creating a near-duplicate row.
   *
   * Internal-use helper backing the uniqueness checks.
   */
  async findByName(name: string): Promise<TeamEntity | null> {
    return this.teamRepository
      .createQueryBuilder('team')
      .where('LOWER(team.name) = LOWER(:name)', { name })
      .getOne();
  }

  /**
   * Looks a team up by code. Case-sensitive by design: the DTO already
   * uppercases the input, so stored codes are uniformly uppercase.
   *
   * Internal-use helper backing the uniqueness checks.
   */
  async findByCode(code: string): Promise<TeamEntity | null> {
    return this.teamRepository.findOne({ where: { code } });
  }

  /**
   * Applies a partial update to a team (admin-only).
   *
   * Only the fields present on the DTO are touched. A changed name or code is
   * checked against the other teams — a row matching itself is not a conflict,
   * so re-submitting the current value is a no-op rather than a 400.
   *
   * @throws {NotFoundException} if no team has the given id.
   * @throws {BadRequestException} if the new name or code belongs to another team.
   */
  async update(id: string, dto: UpdateTeamDto): Promise<TeamEntity> {
    const team = await this.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (dto.name !== undefined) {
      const existing = await this.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new BadRequestException('Team name already exists');
      }
    }

    if (dto.code !== undefined) {
      const existing = await this.findByCode(dto.code);
      if (existing && existing.id !== id) {
        throw new BadRequestException('Team code already exists');
      }
    }

    if (dto.name !== undefined) team.name = dto.name;
    if (dto.code !== undefined) team.code = dto.code;
    if (dto.flag !== undefined) team.flag = dto.flag;

    return this.teamRepository.save(team);
  }
}
