import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';

import { TeamService } from './team.service';
import { TeamEntity } from '../entities/team.entity';

const TEAM_ID = 'team-uuid-a';
const OTHER_ID = 'team-uuid-b';
const CREATED_AT = new Date('2026-07-27T10:15:00.000Z');
const FLAG = 'https://cdn.example.com/flags/fra.png';

type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<
    Repository<T>,
    'findOne' | 'find' | 'create' | 'save' | 'createQueryBuilder'
  >
>;

/** Chainable QueryBuilder stub: `where` returns `this`; `getOne` resolves the row. */
type QbMock = {
  where: jest.Mock;
  getOne: jest.Mock;
};

function makeQb(row: TeamEntity | null): QbMock {
  const qb: QbMock = {
    where: jest.fn(() => qb),
    getOne: jest.fn().mockResolvedValue(row),
  };
  return qb;
}

describe('TeamService', () => {
  let service: TeamService;
  let teamRepo: RepoMock<TeamEntity>;

  /** Builds a persisted-looking team. */
  function makeTeam(overrides: Partial<TeamEntity> = {}): TeamEntity {
    return {
      id: TEAM_ID,
      name: 'France',
      code: 'FRA',
      flag: FLAG,
      createdAt: CREATED_AT,
      ...overrides,
    } as TeamEntity;
  }

  /** Points `findByName`'s QueryBuilder at the given row for the next call. */
  function stubFindByName(row: TeamEntity | null): QbMock {
    const qb = makeQb(row);
    teamRepo.createQueryBuilder.mockReturnValue(qb as never);
    return qb;
  }

  beforeEach(async () => {
    teamRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    const dto = { name: 'France', code: 'FRA', flag: FLAG };

    it('persists when neither the name nor the code is taken', async () => {
      stubFindByName(null);
      teamRepo.findOne.mockResolvedValue(null); // findByCode
      const built = makeTeam();
      teamRepo.create.mockReturnValue(built);
      teamRepo.save.mockResolvedValue(built);

      const result = await service.create(dto);

      expect(teamRepo.create).toHaveBeenCalledWith({
        name: 'France',
        code: 'FRA',
        flag: FLAG,
      });
      expect(teamRepo.save).toHaveBeenCalledWith(built);
      expect(result).toBe(built);
    });

    it('throws BadRequestException and does not save on a duplicate name', async () => {
      stubFindByName(makeTeam());

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(teamRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException and does not save on a duplicate code', async () => {
      stubFindByName(null);
      teamRepo.findOne.mockResolvedValue(makeTeam()); // findByCode hits

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(teamRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns teams ordered alphabetically by name', async () => {
      const rows = [makeTeam()];
      teamRepo.find.mockResolvedValue(rows);

      const result = await service.findAll();

      expect(teamRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
      expect(result).toBe(rows);
    });
  });

  describe('findById', () => {
    it('queries by id', async () => {
      const team = makeTeam();
      teamRepo.findOne.mockResolvedValue(team);

      const result = await service.findById(TEAM_ID);

      expect(teamRepo.findOne).toHaveBeenCalledWith({ where: { id: TEAM_ID } });
      expect(result).toBe(team);
    });

    it('returns null when the team does not exist', async () => {
      teamRepo.findOne.mockResolvedValue(null);
      expect(await service.findById(TEAM_ID)).toBeNull();
    });
  });

  describe('findByName', () => {
    it('compares names case-insensitively', async () => {
      const qb = stubFindByName(makeTeam());

      const result = await service.findByName('france');

      expect(qb.where).toHaveBeenCalledWith('LOWER(team.name) = LOWER(:name)', {
        name: 'france',
      });
      expect(result).not.toBeNull();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the team is missing', async () => {
      teamRepo.findOne.mockResolvedValue(null);

      await expect(service.update(TEAM_ID, { flag: FLAG })).rejects.toThrow(
        NotFoundException,
      );
      expect(teamRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a name already held by another team', async () => {
      teamRepo.findOne.mockResolvedValue(makeTeam()); // findById
      stubFindByName(makeTeam({ id: OTHER_ID })); // name belongs elsewhere

      await expect(
        service.update(TEAM_ID, { name: 'Tunisia' }),
      ).rejects.toThrow(BadRequestException);
      expect(teamRepo.save).not.toHaveBeenCalled();
    });

    it("allows re-submitting the team's own name (self is not a conflict)", async () => {
      const existing = makeTeam();
      teamRepo.findOne.mockResolvedValue(existing);
      stubFindByName(existing); // same id -> no conflict
      teamRepo.save.mockResolvedValue(existing);

      const result = await service.update(TEAM_ID, { name: 'France' });

      expect(teamRepo.save).toHaveBeenCalledWith(existing);
      expect(result).toBe(existing);
    });

    it('rejects a code already held by another team', async () => {
      teamRepo.findOne
        .mockResolvedValueOnce(makeTeam()) // findById
        .mockResolvedValueOnce(makeTeam({ id: OTHER_ID })); // findByCode

      await expect(service.update(TEAM_ID, { code: 'TUN' })).rejects.toThrow(
        BadRequestException,
      );
      expect(teamRepo.save).not.toHaveBeenCalled();
    });

    it('applies only the present fields and saves', async () => {
      const existing = makeTeam();
      teamRepo.findOne.mockResolvedValue(existing);
      teamRepo.save.mockResolvedValue(existing);

      const newFlag = 'https://cdn.example.com/flags/new.png';
      const result = await service.update(TEAM_ID, { flag: newFlag });

      expect(existing.flag).toBe(newFlag);
      expect(existing.name).toBe('France'); // untouched
      expect(teamRepo.save).toHaveBeenCalledWith(existing);
      expect(result).toBe(existing);
    });
  });
});
