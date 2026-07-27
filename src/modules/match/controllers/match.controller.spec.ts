import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { MatchController } from './match.controller';
import { MatchService } from '../services/match.service';
import { MatchEntity, MatchStatus } from '../entities/match.entity';
import { TeamEntity } from '../entities/team.entity';
import { UserRole } from '../../user/entities/user.entity';

const MATCH_ID = 'b2c4d6e8-0a1b-4c3d-9e8f-1a2b3c4d5e6f';
const TEAM_A = { id: 'team-uuid-a', name: 'France', code: 'FRA' } as TeamEntity;
const TEAM_B = { id: 'team-uuid-b', name: 'Tunisia', code: 'TUN' } as TeamEntity;
const MATCH_DATE = '2099-11-21T16:00:00.000Z';
const STADIUM = 'Lusail Stadium';

type ServiceMock = jest.Mocked<
  Pick<MatchService, 'findAll' | 'findById' | 'create' | 'update'>
>;

describe('MatchController', () => {
  let controller: MatchController;
  let service: ServiceMock;

  /** Builds a persisted-looking match with populated team relations. */
  function makeMatch(overrides: Partial<MatchEntity> = {}): MatchEntity {
    return {
      id: MATCH_ID,
      matchDate: new Date(MATCH_DATE),
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
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchController],
      providers: [{ provide: MatchService, useValue: service }],
    }).compile();

    controller = module.get<MatchController>(MatchController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findAll (EF-06, EF-07)', () => {
    it('passes the filter through and maps entities to response DTOs', async () => {
      service.findAll.mockResolvedValue([makeMatch()]);
      const filter = { teamName: 'France' };

      const result = await controller.findAll(filter);

      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: MATCH_ID,
        homeTeam: { id: TEAM_A.id, name: 'France', code: 'FRA' },
        awayTeam: { id: TEAM_B.id, name: 'Tunisia', code: 'TUN' },
        matchDate: MATCH_DATE, // Date -> ISO string
        stadium: STADIUM,
        status: MatchStatus.SCHEDULED,
      });
    });
  });

  describe('findOne', () => {
    it('returns the mapped match when found', async () => {
      service.findById.mockResolvedValue(makeMatch());

      const result = await controller.findOne(MATCH_ID);

      expect(service.findById).toHaveBeenCalledWith(MATCH_ID);
      expect(result.id).toBe(MATCH_ID);
      expect(result.matchDate).toBe(MATCH_DATE);
    });

    it('throws NotFoundException when the match is missing', async () => {
      service.findById.mockResolvedValue(null);

      await expect(controller.findOne(MATCH_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create (EF-17)', () => {
    it('delegates to the service and maps the created match', async () => {
      const created = makeMatch();
      service.create.mockResolvedValue(created);
      const dto = {
        homeTeamId: TEAM_A.id,
        awayTeamId: TEAM_B.id,
        matchDate: MATCH_DATE,
        stadium: STADIUM,
      };

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result.id).toBe(MATCH_ID);
      expect(result.homeTeam.code).toBe('FRA');
    });

    it('is restricted to the ADMIN role', () => {
      const roles = Reflect.getMetadata('roles', controller.create);
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });

  describe('update (EF-17)', () => {
    it('delegates to the service with id and dto, then maps the result', async () => {
      const updated = makeMatch({ status: MatchStatus.LIVE });
      service.update.mockResolvedValue(updated);
      const dto = { status: MatchStatus.LIVE };

      const result = await controller.update(MATCH_ID, dto);

      expect(service.update).toHaveBeenCalledWith(MATCH_ID, dto);
      expect(result.status).toBe(MatchStatus.LIVE);
    });

    it('is restricted to the ADMIN role', () => {
      const roles = Reflect.getMetadata('roles', controller.update);
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });
});
