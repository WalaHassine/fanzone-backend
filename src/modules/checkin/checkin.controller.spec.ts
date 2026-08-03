import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { CheckinEntity } from './entities/checkin.entity';
import { CrowdResponseDto } from './dto';
import { UserRole } from '../user/entities/user.entity';
import type { AuthUser } from '../../common/decorators';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const CREATED_AT = '2026-07-27T18:30:00.000Z';

const OTHER_TOKEN = '3b241101-e2bb-4255-8caf-4136c566a962';

type ServiceMock = jest.Mocked<
  Pick<CheckinService, 'create' | 'checkout' | 'getCrowdStatus'>
>;

describe('CheckinController', () => {
  let controller: CheckinController;
  let service: ServiceMock;

  /** Reads decorator metadata off a handler, to assert how a route is guarded. */
  function metadataOf(key: string, handler: keyof CheckinController): unknown {
    return Reflect.getMetadata(key, controller[handler]);
  }

  const currentUser: AuthUser = {
    userId: USER_ID,
    email: 'fan1@test.local',
    role: UserRole.USER,
  };

  /**
   * A check-in as it comes back from the service: carrying the stored `userId`
   * and the eager relations. Everything the mapper must leave behind.
   */
  function makeCheckin(overrides: Partial<CheckinEntity> = {}): CheckinEntity {
    return {
      id: 'checkin-uuid-a',
      userId: USER_ID,
      sessionToken: SESSION_TOKEN,
      fanzoneId: FANZONE_ID,
      teamId: TEAM_ID,
      createdAt: new Date(CREATED_AT),
      user: { id: USER_ID, email: 'fan1@test.local' },
      fanzone: { id: FANZONE_ID, name: 'Tunis Stadium' },
      team: { id: TEAM_ID, name: 'Tunisia' },
      ...overrides,
    } as unknown as CheckinEntity;
  }

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      checkout: jest.fn(),
      getCrowdStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckinController],
      providers: [{ provide: CheckinService, useValue: service }],
    }).compile();

    controller = module.get<CheckinController>(CheckinController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create (EF-10)', () => {
    it('passes the id from the token, not anything in the body', async () => {
      service.create.mockResolvedValue(makeCheckin());
      const dto = { fanzoneId: FANZONE_ID, teamId: TEAM_ID };

      await controller.create(currentUser, dto);

      expect(service.create).toHaveBeenCalledWith(USER_ID, dto);
    });

    it('maps the entity onto the response shape', async () => {
      service.create.mockResolvedValue(makeCheckin());

      const result = await controller.create(currentUser, {
        fanzoneId: FANZONE_ID,
        teamId: TEAM_ID,
      });

      expect(result).toEqual({
        sessionToken: SESSION_TOKEN,
        fanzoneId: FANZONE_ID,
        teamName: 'Tunisia',
        createdAt: CREATED_AT,
      });
    });

    /**
     * The load-bearing assertion for ENF-05: the entity handed to the mapper
     * carries a userId, an email and the eager relations, and none of it reaches
     * the response.
     */
    it('exposes no user identifier (ENF-05)', async () => {
      service.create.mockResolvedValue(makeCheckin());

      const result = await controller.create(currentUser, {
        fanzoneId: FANZONE_ID,
        teamId: TEAM_ID,
      });

      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('user');
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(USER_ID);
      expect(serialised).not.toContain('@');
    });

    it('returns createdAt as an ISO string rather than a Date', async () => {
      service.create.mockResolvedValue(makeCheckin());

      const result = await controller.create(currentUser, {
        fanzoneId: FANZONE_ID,
        teamId: TEAM_ID,
      });

      expect(typeof result.createdAt).toBe('string');
      expect(result.createdAt).toBe(CREATED_AT);
    });

    it('propagates service rejections untouched', async () => {
      service.create.mockRejectedValue(new Error('Fan zone is full'));

      await expect(
        controller.create(currentUser, {
          fanzoneId: FANZONE_ID,
          teamId: TEAM_ID,
        }),
      ).rejects.toThrow('Fan zone is full');
    });
  });

  describe('checkout (EF-10)', () => {
    const dto = { sessionToken: SESSION_TOKEN, fanzoneId: FANZONE_ID };

    it('passes the id from the token and the token from the path', async () => {
      await controller.checkout(currentUser, SESSION_TOKEN, dto);

      // The path param is the lookup key — it is the one that went through
      // ParseUUIDPipe. The body supplies only the fan zone guard.
      expect(service.checkout).toHaveBeenCalledWith(
        USER_ID,
        SESSION_TOKEN,
        FANZONE_ID,
      );
    });

    it('returns the success message', async () => {
      const result = await controller.checkout(currentUser, SESSION_TOKEN, dto);

      expect(result).toEqual({ message: 'Checked out successfully' });
    });

    it('rejects a body token that disagrees with the path, without calling the service', async () => {
      await expect(
        controller.checkout(currentUser, SESSION_TOKEN, {
          ...dto,
          sessionToken: OTHER_TOKEN,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(service.checkout).not.toHaveBeenCalled();
    });

    it('accepts the two tokens in different cases', async () => {
      // @IsUUID('all') accepts either case, so the same token can arrive twice
      // spelled differently — that is agreement, not a mismatch.
      await expect(
        controller.checkout(currentUser, SESSION_TOKEN, {
          ...dto,
          sessionToken: SESSION_TOKEN.toUpperCase(),
        }),
      ).resolves.toEqual({ message: 'Checked out successfully' });
    });

    it('propagates ForbiddenException untouched', async () => {
      service.checkout.mockRejectedValue(
        new ForbiddenException('That check-in belongs to another user'),
      );

      await expect(
        controller.checkout(currentUser, SESSION_TOKEN, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('is authenticated', () => {
      expect(metadataOf('__guards__', 'checkout')).toBeDefined();
    });
  });

  describe('getCrowd (EF-11, EF-12)', () => {
    const snapshot: CrowdResponseDto = {
      fanzoneId: FANZONE_ID,
      totalPresent: 5,
      byTeam: [
        { teamName: 'Tunisia', count: 3, percentage: 60 },
        { teamName: 'France', count: 2, percentage: 40 },
      ],
      occupancyPercentage: 5,
      updatedAt: CREATED_AT,
    };

    it('forwards the fan zone id and returns the snapshot unchanged', async () => {
      service.getCrowdStatus.mockResolvedValue(snapshot);

      const result = await controller.getCrowd(FANZONE_ID);

      expect(service.getCrowdStatus).toHaveBeenCalledWith(FANZONE_ID);
      expect(result).toBe(snapshot);
    });

    it('is public, matching GET /fanzones/:id/crowd', () => {
      // Aggregates with no user data in them — that is the point of EF-11.
      expect(metadataOf('__guards__', 'getCrowd')).toBeUndefined();
    });
  });
});
