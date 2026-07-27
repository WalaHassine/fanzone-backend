import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { TeamController } from './team.controller';
import { TeamService } from '../services/team.service';
import { TeamEntity } from '../entities/team.entity';
import { UserRole } from '../../user/entities/user.entity';

const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const CREATED_AT = '2026-07-27T10:15:00.000Z';
const FLAG = 'https://cdn.example.com/flags/fra.png';

type ServiceMock = jest.Mocked<
  Pick<TeamService, 'findAll' | 'findById' | 'create' | 'update'>
>;

describe('TeamController', () => {
  let controller: TeamController;
  let service: ServiceMock;

  /** Builds a persisted-looking team. */
  function makeTeam(overrides: Partial<TeamEntity> = {}): TeamEntity {
    return {
      id: TEAM_ID,
      name: 'France',
      code: 'FRA',
      flag: FLAG,
      createdAt: new Date(CREATED_AT),
      ...overrides,
    } as TeamEntity;
  }

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamController],
      providers: [{ provide: TeamService, useValue: service }],
    }).compile();

    controller = module.get<TeamController>(TeamController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findAll', () => {
    it('maps entities to response DTOs', async () => {
      service.findAll.mockResolvedValue([makeTeam()]);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledWith();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: TEAM_ID,
        name: 'France',
        code: 'FRA',
        flag: FLAG,
        createdAt: CREATED_AT, // Date -> ISO string
      });
    });

    it('projects a missing flag as null', async () => {
      service.findAll.mockResolvedValue([
        makeTeam({ flag: null as unknown as string }),
      ]);

      const result = await controller.findAll();

      expect(result[0].flag).toBeNull();
    });
  });

  describe('findOne', () => {
    it('returns the mapped team when found', async () => {
      service.findById.mockResolvedValue(makeTeam());

      const result = await controller.findOne(TEAM_ID);

      expect(service.findById).toHaveBeenCalledWith(TEAM_ID);
      expect(result.id).toBe(TEAM_ID);
      expect(result.createdAt).toBe(CREATED_AT);
    });

    it('throws NotFoundException when the team is missing', async () => {
      service.findById.mockResolvedValue(null);

      await expect(controller.findOne(TEAM_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create (EF-17)', () => {
    it('delegates to the service and maps the created team', async () => {
      const created = makeTeam();
      service.create.mockResolvedValue(created);
      const dto = { name: 'France', code: 'FRA' };

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result.id).toBe(TEAM_ID);
      expect(result.code).toBe('FRA');
    });

    it('is restricted to the ADMIN role', () => {
      const roles = Reflect.getMetadata('roles', controller.create);
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });

  describe('update (EF-17)', () => {
    it('delegates to the service with id and dto, then maps the result', async () => {
      const newFlag = 'https://cdn.example.com/flags/new.png';
      service.update.mockResolvedValue(makeTeam({ flag: newFlag }));
      const dto = { flag: newFlag };

      const result = await controller.update(TEAM_ID, dto);

      expect(service.update).toHaveBeenCalledWith(TEAM_ID, dto);
      expect(result.flag).toBe(newFlag);
    });

    it('is restricted to the ADMIN role', () => {
      const roles = Reflect.getMetadata('roles', controller.update);
      expect(roles).toEqual([UserRole.ADMIN]);
    });
  });
});
