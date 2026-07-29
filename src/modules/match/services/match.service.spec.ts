import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';

import { MatchService } from './match.service';
import { MatchEntity, MatchStatus } from '../entities/match.entity';
import { TeamEntity } from '../entities/team.entity';

const MATCH_ID = 'match-uuid-1';
const TEAM_A = { id: 'team-uuid-a', name: 'France', code: 'FRA' } as TeamEntity;
const TEAM_B = {
  id: 'team-uuid-b',
  name: 'Tunisia',
  code: 'TUN',
} as TeamEntity;
const FUTURE = '2099-11-21T16:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';
const STADIUM = 'Lusail Stadium';

type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<
    Repository<T>,
    'findOne' | 'find' | 'create' | 'save' | 'createQueryBuilder'
  >
>;

/** Chainable QueryBuilder stub: every builder call returns `this`; getMany resolves the rows. */
type QbMock = {
  leftJoinAndSelect: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  getMany: jest.Mock;
};

function makeQb(rows: MatchEntity[]): QbMock {
  const qb: QbMock = {
    leftJoinAndSelect: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

describe('MatchService', () => {
  let service: MatchService;
  let matchRepo: RepoMock<MatchEntity>;
  let teamRepo: RepoMock<TeamEntity>;

  /** Builds a persisted-looking match with populated team relations. */
  function makeMatch(overrides: Partial<MatchEntity> = {}): MatchEntity {
    return {
      id: MATCH_ID,
      matchDate: new Date(FUTURE),
      stadium: STADIUM,
      status: MatchStatus.SCHEDULED,
      homeTeamId: TEAM_A.id,
      awayTeamId: TEAM_B.id,
      homeTeam: TEAM_A,
      awayTeam: TEAM_B,
      ...overrides,
    } as MatchEntity;
  }

  beforeEach(async () => {
    matchRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    teamRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        { provide: getRepositoryToken(MatchEntity), useValue: matchRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    const dto = {
      homeTeamId: TEAM_A.id,
      awayTeamId: TEAM_B.id,
      matchDate: FUTURE,
      stadium: STADIUM,
    };

    it('validates teams and future date, then persists', async () => {
      teamRepo.find.mockResolvedValue([TEAM_A, TEAM_B]);
      const built = makeMatch();
      matchRepo.create.mockReturnValue(built);
      matchRepo.save.mockResolvedValue(built);

      const result = await service.create(dto);

      expect(matchRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          homeTeamId: TEAM_A.id,
          awayTeamId: TEAM_B.id,
          stadium: STADIUM,
          status: MatchStatus.SCHEDULED,
          matchDate: new Date(FUTURE),
        }),
      );
      expect(matchRepo.save).toHaveBeenCalledWith(built);
      expect(result).toBe(built);
    });

    it('throws NotFoundException and does not save when a team is missing', async () => {
      teamRepo.find.mockResolvedValue([TEAM_A]); // only one of two found

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(matchRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException and does not save for a past date', async () => {
      teamRepo.find.mockResolvedValue([TEAM_A, TEAM_B]);

      await expect(service.create({ ...dto, matchDate: PAST })).rejects.toThrow(
        BadRequestException,
      );
      expect(matchRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll (EF-06, EF-07)', () => {
    it('returns all matches ordered by matchDate ASC when no filter is given', async () => {
      const rows = [makeMatch()];
      const qb = makeQb(rows);
      matchRepo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findAll();

      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'match.homeTeam',
        'homeTeam',
      );
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'match.awayTeam',
        'awayTeam',
      );
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('match.matchDate', 'ASC');
      expect(result).toBe(rows);
    });

    it('filters by team name case-insensitively against home OR away (EF-07)', async () => {
      const qb = makeQb([]);
      matchRepo.createQueryBuilder.mockReturnValue(qb as never);

      await service.findAll({ teamName: 'fra' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(homeTeam.name ILIKE :teamName OR awayTeam.name ILIKE :teamName)',
        { teamName: '%fra%' },
      );
    });

    it('applies date-range and status conditions', async () => {
      const qb = makeQb([]);
      matchRepo.createQueryBuilder.mockReturnValue(qb as never);

      await service.findAll({
        startDate: FUTURE,
        endDate: FUTURE,
        status: MatchStatus.COMPLETED,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'match.matchDate >= :startDate',
        {
          startDate: FUTURE,
        },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('match.matchDate <= :endDate', {
        endDate: FUTURE,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('match.status = :status', {
        status: MatchStatus.COMPLETED,
      });
    });
  });

  describe('findById', () => {
    it('queries by id and requests the team relations', async () => {
      const match = makeMatch();
      matchRepo.findOne.mockResolvedValue(match);

      const result = await service.findById(MATCH_ID);

      expect(matchRepo.findOne).toHaveBeenCalledWith({
        where: { id: MATCH_ID },
        relations: { homeTeam: true, awayTeam: true },
      });
      expect(result).toBe(match);
    });

    it('returns null when the match does not exist', async () => {
      matchRepo.findOne.mockResolvedValue(null);
      expect(await service.findById(MATCH_ID)).toBeNull();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the match is missing', async () => {
      matchRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(MATCH_ID, { stadium: STADIUM }),
      ).rejects.toThrow(NotFoundException);
      expect(matchRepo.save).not.toHaveBeenCalled();
    });

    it('validates a newly referenced team and rejects a missing one', async () => {
      matchRepo.findOne.mockResolvedValue(makeMatch());
      teamRepo.find.mockResolvedValue([]); // referenced team not found

      await expect(
        service.update(MATCH_ID, { homeTeamId: 'ghost-team' }),
      ).rejects.toThrow(NotFoundException);
      expect(matchRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a past matchDate without saving', async () => {
      matchRepo.findOne.mockResolvedValue(makeMatch());

      await expect(
        service.update(MATCH_ID, { matchDate: PAST }),
      ).rejects.toThrow(BadRequestException);
      expect(matchRepo.save).not.toHaveBeenCalled();
    });

    it('applies changes, saves, and returns the reloaded match', async () => {
      const existing = makeMatch();
      const reloaded = makeMatch({ status: MatchStatus.LIVE });
      // 1st findById -> existing (load), 2nd findById -> reloaded (return).
      matchRepo.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(reloaded);
      matchRepo.save.mockResolvedValue(existing);

      const result = await service.update(MATCH_ID, {
        status: MatchStatus.LIVE,
      });

      expect(existing.status).toBe(MatchStatus.LIVE);
      expect(matchRepo.save).toHaveBeenCalledWith(existing);
      expect(result).toBe(reloaded);
    });
  });
});
