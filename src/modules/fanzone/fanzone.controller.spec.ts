import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { FanzoneController } from './fanzone.controller';
import { FanzoneService, FanzoneWithDistance } from './fanzone.service';
import { FanzoneEntity } from './entities/fanzone.entity';
import { TeamEntity } from '../match/entities/team.entity';
import { CrowdStatusDto } from './dto';
import { UserRole } from '../user/entities/user.entity';

const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const OTHER_FANZONE_ID = 'd2e3f4a5-6b7c-4d8e-9f0a-1b2c3d4e5f60';
const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const CREATED_AT = '2026-07-27T10:15:00.000Z';
const UPDATED_AT = '2026-07-28T09:00:00.000Z';

/**
 * Reads decorator metadata off a handler by name.
 *
 * Goes through the prototype under an index signature rather than
 * `controller.create`: passing a method reference around trips
 * `@typescript-eslint/unbound-method`, and the metadata lives on the prototype
 * method either way.
 */
function metadataOf(key: string, method: string): unknown {
  const handler = (
    FanzoneController.prototype as unknown as Record<string, object>
  )[method];
  return Reflect.getMetadata(key, handler);
}

type ServiceMock = jest.Mocked<
  Pick<
    FanzoneService,
    'findAll' | 'findById' | 'create' | 'update' | 'getCrowdStatus'
  > & { getCrowdStatusMany: jest.Mock }
>;

describe('FanzoneController', () => {
  let controller: FanzoneController;
  let service: ServiceMock;

  function makeTeam(overrides: Partial<TeamEntity> = {}): TeamEntity {
    return {
      id: TEAM_ID,
      name: 'France',
      code: 'FRA',
      flag: 'https://cdn.example.com/flags/fra.png',
      createdAt: new Date(CREATED_AT),
      ...overrides,
    } as TeamEntity;
  }

  /**
   * Builds a fan zone as it comes back from `pg`: `numeric` columns as strings
   * and `time` columns as `HH:mm:ss`. The mapper's job is to normalise both.
   */
  function makeFanzone(overrides: Partial<FanzoneEntity> = {}): FanzoneEntity {
    return {
      id: FANZONE_ID,
      name: 'Doha Corniche Fan Zone',
      description: 'Open-air zone on the Corniche.',
      latitude: '25.28540000',
      longitude: '51.53100000',
      location: 'SRID=4326;POINT(51.531 25.2854)',
      capacity: 5000,
      availableSpots: 3200,
      address: 'Al Corniche Street, Doha',
      city: 'Doha',
      openingHour: '18:00:00',
      closingHour: '00:00:00',
      createdAt: new Date(CREATED_AT),
      updatedAt: new Date(UPDATED_AT),
      teams: [makeTeam()],
      ...overrides,
    } as unknown as FanzoneEntity;
  }

  function makeCrowd(overrides: Partial<CrowdStatusDto> = {}): CrowdStatusDto {
    return {
      totalPresent: 800,
      byTeam: [{ teamName: 'France', count: 800, percentage: 100 }],
      occupancyPercentage: 36,
      ...overrides,
    };
  }

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      getCrowdStatus: jest.fn(),
      getCrowdStatusMany: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FanzoneController],
      providers: [{ provide: FanzoneService, useValue: service }],
    }).compile();

    controller = module.get<FanzoneController>(FanzoneController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findAll (EF-08, EF-09)', () => {
    it('passes the filter through and maps every result', async () => {
      service.findAll.mockResolvedValue([makeFanzone()]);
      const filter = { city: 'doha' };

      const result = await controller.findAll(filter);

      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(FANZONE_ID);
    });

    it('coerces numeric coordinates from the strings pg returns', async () => {
      service.findAll.mockResolvedValue([makeFanzone()]);

      const [fanzone] = await controller.findAll({});

      expect(fanzone.latitude).toBe(25.2854);
      expect(fanzone.longitude).toBe(51.531);
      expect(typeof fanzone.latitude).toBe('number');
    });

    it('trims HH:mm:ss times down to HH:mm', async () => {
      service.findAll.mockResolvedValue([makeFanzone()]);

      const [fanzone] = await controller.findAll({});

      expect(fanzone.openingHour).toBe('18:00');
      expect(fanzone.closingHour).toBe('00:00');
    });

    it('projects unset times and description as null', async () => {
      service.findAll.mockResolvedValue([
        makeFanzone({
          openingHour: null as unknown as string,
          closingHour: null as unknown as string,
          description: null as unknown as string,
        }),
      ]);

      const [fanzone] = await controller.findAll({});

      expect(fanzone.openingHour).toBeNull();
      expect(fanzone.closingHour).toBeNull();
      expect(fanzone.description).toBeNull();
    });

    it('converts timestamps to ISO strings', async () => {
      service.findAll.mockResolvedValue([makeFanzone()]);

      const [fanzone] = await controller.findAll({});

      expect(fanzone.createdAt).toBe(CREATED_AT);
      expect(fanzone.updatedAt).toBe(UPDATED_AT);
    });

    it('maps broadcast teams, normalising a missing flag to null', async () => {
      service.findAll.mockResolvedValue([
        makeFanzone({ teams: [makeTeam({ flag: null as unknown as string })] }),
      ]);

      const [fanzone] = await controller.findAll({});

      expect(fanzone.teams).toEqual([
        {
          id: TEAM_ID,
          name: 'France',
          code: 'FRA',
          flag: null,
          createdAt: CREATED_AT,
        },
      ]);
    });

    it('keeps the PostGIS column and internal relations off the wire', async () => {
      service.findAll.mockResolvedValue([makeFanzone()]);

      const [fanzone] = await controller.findAll({});

      expect(fanzone).not.toHaveProperty('location');
      expect(fanzone).not.toHaveProperty('checkIns');
      expect(fanzone).not.toHaveProperty('recommendations');
      expect(fanzone).not.toHaveProperty('statistics');
    });

    it('passes through the distance the service attached', async () => {
      const withDistance = makeFanzone() as FanzoneWithDistance;
      withDistance.distance = 2.4;
      service.findAll.mockResolvedValue([withDistance]);

      const [fanzone] = await controller.findAll({
        latitude: 25.2854,
        longitude: 51.531,
        maxDistance: 5,
      });

      expect(fanzone.distance).toBe(2.4);
    });

    it('leaves distance undefined when no coordinates were supplied', async () => {
      service.findAll.mockResolvedValue([makeFanzone()]);

      const [fanzone] = await controller.findAll({});

      expect(fanzone.distance).toBeUndefined();
    });

    it('aggregates crowd status in ONE call for the whole page, not per fan zone', async () => {
      const first = makeFanzone();
      const second = makeFanzone({ id: OTHER_FANZONE_ID });
      service.findAll.mockResolvedValue([first, second]);
      service.getCrowdStatusMany.mockResolvedValue(
        new Map([
          [FANZONE_ID, makeCrowd({ totalPresent: 800 })],
          [OTHER_FANZONE_ID, makeCrowd({ totalPresent: 12 })],
        ]),
      );

      const result = await controller.findAll({});

      expect(service.getCrowdStatusMany).toHaveBeenCalledTimes(1);
      expect(service.getCrowdStatusMany).toHaveBeenCalledWith([first, second]);
      expect(service.getCrowdStatus).not.toHaveBeenCalled();
      expect(result[0].crowdStatus?.totalPresent).toBe(800);
      expect(result[1].crowdStatus?.totalPresent).toBe(12);
    });

    it('returns an empty array when nothing matches', async () => {
      service.findAll.mockResolvedValue([]);

      const result = await controller.findAll({});

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the fan zone with its crowd snapshot', async () => {
      const fanzone = makeFanzone();
      service.findById.mockResolvedValue(fanzone);
      service.getCrowdStatusMany.mockResolvedValue(
        new Map([[FANZONE_ID, makeCrowd()]]),
      );

      const result = await controller.findOne(FANZONE_ID);

      expect(service.findById).toHaveBeenCalledWith(FANZONE_ID);
      expect(result.id).toBe(FANZONE_ID);
      expect(result.crowdStatus?.occupancyPercentage).toBe(36);
    });

    it('reuses the entity it already loaded instead of re-querying it', async () => {
      const fanzone = makeFanzone();
      service.findById.mockResolvedValue(fanzone);

      await controller.findOne(FANZONE_ID);

      expect(service.getCrowdStatusMany).toHaveBeenCalledWith([fanzone]);
      expect(service.getCrowdStatus).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the fan zone is missing', async () => {
      service.findById.mockResolvedValue(null);

      await expect(controller.findOne(FANZONE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(service.getCrowdStatusMany).not.toHaveBeenCalled();
    });
  });

  describe('getCrowd (EF-11)', () => {
    it('delegates to the service and returns the snapshot unchanged', async () => {
      const crowd = makeCrowd();
      service.getCrowdStatus.mockResolvedValue(crowd);

      const result = await controller.getCrowd(FANZONE_ID);

      expect(service.getCrowdStatus).toHaveBeenCalledWith(FANZONE_ID);
      expect(result).toBe(crowd);
    });

    it('exposes no user identifier in the response', async () => {
      service.getCrowdStatus.mockResolvedValue(makeCrowd());

      const result = await controller.getCrowd(FANZONE_ID);

      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain('userId');
      expect(serialised).not.toContain('sessionToken');
    });

    it('propagates the service NotFoundException', async () => {
      service.getCrowdStatus.mockRejectedValue(
        new NotFoundException('Fan zone not found'),
      );

      await expect(controller.getCrowd(FANZONE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('is public — no guards attached', () => {
      expect(metadataOf('__guards__', 'getCrowd')).toBeUndefined();
    });
  });

  describe('create (EF-18)', () => {
    const dto = {
      name: 'Doha Corniche Fan Zone',
      latitude: 25.2854,
      longitude: 51.531,
      capacity: 5000,
      address: 'Al Corniche Street, Doha',
      city: 'Doha',
      teamIds: [TEAM_ID],
    };

    it('delegates to the service and maps the created fan zone', async () => {
      service.create.mockResolvedValue(
        makeFanzone({ capacity: 5000, availableSpots: 5000 }),
      );

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result.id).toBe(FANZONE_ID);
      expect(result.availableSpots).toBe(5000);
    });

    it('omits crowd status for a freshly created fan zone', async () => {
      service.create.mockResolvedValue(makeFanzone());

      const result = await controller.create(dto);

      expect(result.crowdStatus).toBeUndefined();
      expect(service.getCrowdStatusMany).not.toHaveBeenCalled();
    });

    it('is restricted to the ADMIN role', () => {
      expect(metadataOf('roles', 'create')).toEqual([UserRole.ADMIN]);
    });
  });

  describe('update (EF-18, EF-19)', () => {
    it('delegates with id and dto, then maps the result', async () => {
      service.update.mockResolvedValue(
        makeFanzone({ capacity: 4000, availableSpots: 2200 }),
      );
      const dto = { capacity: 4000 };

      const result = await controller.update(FANZONE_ID, dto);

      expect(service.update).toHaveBeenCalledWith(FANZONE_ID, dto);
      expect(result.capacity).toBe(4000);
      expect(result.availableSpots).toBe(2200);
    });

    it('propagates the service NotFoundException', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('Fan zone not found'),
      );

      await expect(
        controller.update(FANZONE_ID, { city: 'Lusail' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('is restricted to the ADMIN role', () => {
      expect(metadataOf('roles', 'update')).toEqual([UserRole.ADMIN]);
    });
  });
});
