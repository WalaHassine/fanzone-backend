import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { MatchEntity, MatchStatus } from '../entities/match.entity';
import { TeamEntity } from '../entities/team.entity';
import { CreateMatchDto } from '../dto/create-match.dto';
import { UpdateMatchDto } from '../dto/update-match.dto';
import { MatchFilterDto } from '../dto/match-filter.dto';

/**
 * MatchService
 *
 * Match CRUD and filtering by team / date / status.
 *
 * Requirement: EF-06 — list matches.
 * Requirement: EF-07 — filter matches by team.
 *
 * Team-existence and future-date checks live here, not only in the DTO layer:
 * `create`/`update` are admin-only operations and the service is also consumed
 * directly by other modules, so validation must not depend on a controller
 * pipe having run first.
 */
@Injectable()
export class MatchService {
  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
  ) {}

  /**
   * Ensures every supplied team id refers to an existing TeamEntity.
   *
   * Ids are de-duplicated first, so passing the same id twice (a match cannot
   * currently have equal home/away teams, but the DTO does not forbid it) does
   * not read as a missing team. A partially valid set is rejected wholesale.
   *
   * @throws {NotFoundException} if any id has no matching team.
   */
  private async assertTeamsExist(ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    const found = await this.teamRepository.find({
      where: { id: In(uniqueIds) },
    });
    if (found.length !== uniqueIds.length) {
      throw new NotFoundException('One or more teams not found');
    }
  }

  /**
   * Parses an ISO 8601 datetime string and asserts it is strictly in the future.
   *
   * @returns the parsed Date, ready to assign to a MatchEntity.
   * @throws {BadRequestException} if the value is unparseable or not in the future.
   */
  private assertFutureDate(iso: string): Date {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new BadRequestException('matchDate must be a datetime in the future');
    }
    return date;
  }

  /**
   * Creates a new match (EF-06). Admin-only.
   *
   * Validates that both teams exist and that the kick-off date is in the future
   * before persisting; either check failing aborts without a write.
   *
   * @throws {NotFoundException} if either team does not exist.
   * @throws {BadRequestException} if `matchDate` is not a future datetime.
   */
  async create(dto: CreateMatchDto): Promise<MatchEntity> {
    await this.assertTeamsExist([dto.homeTeamId, dto.awayTeamId]);
    const matchDate = this.assertFutureDate(dto.matchDate);

    const match = this.matchRepository.create({
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
      matchDate,
      stadium: dto.stadium,
      status: dto.status ?? MatchStatus.SCHEDULED,
    });

    return this.matchRepository.save(match);
  }

  /**
   * Lists matches, optionally filtered (EF-06, EF-07).
   *
   * Uses a QueryBuilder because filtering spans the joined team relations.
   * Note: the entity's `eager` relations are ignored by QueryBuilder, so the
   * home/away teams are joined and selected explicitly. Results are ordered
   * chronologically. With no filter, every match is returned.
   *
   * - `teamName`: case-insensitive partial match against the home OR away team.
   * - `startDate` / `endDate`: inclusive bounds on `matchDate`.
   * - `status`: exact lifecycle-status match.
   */
  async findAll(filter: MatchFilterDto = {}): Promise<MatchEntity[]> {
    const qb = this.matchRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam');

    if (filter.teamName) {
      qb.andWhere(
        '(homeTeam.name ILIKE :teamName OR awayTeam.name ILIKE :teamName)',
        { teamName: `%${filter.teamName}%` },
      );
    }

    if (filter.startDate) {
      qb.andWhere('match.matchDate >= :startDate', {
        startDate: filter.startDate,
      });
    }

    if (filter.endDate) {
      qb.andWhere('match.matchDate <= :endDate', { endDate: filter.endDate });
    }

    if (filter.status) {
      qb.andWhere('match.status = :status', { status: filter.status });
    }

    return qb.orderBy('match.matchDate', 'ASC').getMany();
  }

  /**
   * Fetches a single match with its home and away teams.
   *
   * @returns the match, or `null` if no match has the given id.
   */
  async findById(id: string): Promise<MatchEntity | null> {
    return this.matchRepository.findOne({
      where: { id },
      relations: { homeTeam: true, awayTeam: true },
    });
  }

  /**
   * Applies a partial update to a match (admin-only).
   *
   * Only the fields present on the DTO are touched. Changed team ids are checked
   * for existence and a changed `matchDate` is checked for being in the future,
   * both before any write. The reloaded entity is returned so its home/away team
   * relations reflect the update.
   *
   * @throws {NotFoundException} if the match, or a newly referenced team, is missing.
   * @throws {BadRequestException} if a supplied `matchDate` is not in the future.
   */
  async update(id: string, dto: UpdateMatchDto): Promise<MatchEntity> {
    const match = await this.findById(id);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const teamIds: string[] = [];
    if (dto.homeTeamId !== undefined) teamIds.push(dto.homeTeamId);
    if (dto.awayTeamId !== undefined) teamIds.push(dto.awayTeamId);
    if (teamIds.length > 0) {
      await this.assertTeamsExist(teamIds);
    }

    if (dto.matchDate !== undefined) {
      match.matchDate = this.assertFutureDate(dto.matchDate);
    }
    if (dto.homeTeamId !== undefined) match.homeTeamId = dto.homeTeamId;
    if (dto.awayTeamId !== undefined) match.awayTeamId = dto.awayTeamId;
    if (dto.stadium !== undefined) match.stadium = dto.stadium;
    if (dto.status !== undefined) match.status = dto.status;

    await this.matchRepository.save(match);

    // Reload so the returned entity carries fresh home/away team relations.
    return (await this.findById(id))!;
  }
}
