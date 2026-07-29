import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';

import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { CheckinEntity } from './entities/checkin.entity';
import { UserRole } from '../user/entities/user.entity';
import type { AuthUser } from '../../common/decorators';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const CREATED_AT = '2026-07-27T18:30:00.000Z';

type ServiceMock = jest.Mocked<Pick<CheckinService, 'create'>>;

describe('CheckinController', () => {
  let controller: CheckinController;
  let service: ServiceMock;

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
    service = { create: jest.fn() };

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
});
