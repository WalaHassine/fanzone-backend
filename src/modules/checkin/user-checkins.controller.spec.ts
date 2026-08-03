import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';

import { UserCheckinsController } from './user-checkins.controller';
import { CheckinService } from './checkin.service';
import { CheckinEntity } from './entities/checkin.entity';
import { UserRole } from '../user/entities/user.entity';
import type { AuthUser } from '../../common/decorators';

const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const CREATED_AT = '2026-07-27T18:30:00.000Z';

type ServiceMock = jest.Mocked<Pick<CheckinService, 'getUserCheckIns'>>;

describe('UserCheckinsController', () => {
  let controller: UserCheckinsController;
  let service: ServiceMock;

  const currentUser: AuthUser = {
    userId: USER_ID,
    email: 'fan1@test.local',
    role: UserRole.USER,
  };

  /**
   * A check-in as the service returns it: the stored `userId`, and fan zone and
   * team relations carrying more than the listing is allowed to show. Everything
   * the mapper must leave behind.
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
      fanzone: {
        id: FANZONE_ID,
        name: 'Tunis Stadium',
        city: 'Tunis',
        address: '123 Main St',
        capacity: 100,
        availableSpots: 95,
        location: { type: 'Point', coordinates: [10.18, 36.8] },
      },
      team: { id: TEAM_ID, name: 'Tunisia' },
      ...overrides,
    } as unknown as CheckinEntity;
  }

  beforeEach(async () => {
    service = { getUserCheckIns: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserCheckinsController],
      providers: [{ provide: CheckinService, useValue: service }],
    }).compile();

    controller = module.get<UserCheckinsController>(UserCheckinsController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getMyCheckins (EF-10, ENF-05)', () => {
    it('asks only for the check-ins of the id on the token', async () => {
      await controller.getMyCheckins(currentUser);

      expect(service.getUserCheckIns).toHaveBeenCalledWith(USER_ID);
    });

    it('maps the entities onto the listing shape', async () => {
      service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

      const result = await controller.getMyCheckins(currentUser);

      expect(result).toEqual({
        sessionTokens: [
          {
            sessionToken: SESSION_TOKEN,
            fanzoneId: FANZONE_ID,
            fanzoneInfo: {
              name: 'Tunis Stadium',
              city: 'Tunis',
              address: '123 Main St',
            },
            teamName: 'Tunisia',
            checkedInAt: CREATED_AT,
          },
        ],
      });
    });

    /**
     * The load-bearing assertion for ENF-05. This is the one endpoint that
     * returns check-in rows per person rather than aggregated, so the projection
     * carrying no user identifier is what keeps it inside the requirement.
     */
    it('exposes no user identifier (ENF-05)', async () => {
      service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

      const result = await controller.getMyCheckins(currentUser);

      const [item] = result.sessionTokens;
      expect(item).not.toHaveProperty('userId');
      expect(item).not.toHaveProperty('email');
      expect(item).not.toHaveProperty('user');
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(USER_ID);
      expect(serialised).not.toContain('@');
    });

    it('leaks no fan zone internals', async () => {
      service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

      const result = await controller.getMyCheckins(currentUser);

      // Enough to render the check-in and no more: no coordinates, no capacity,
      // no PostGIS location. The full record is at GET /fanzones/:id.
      expect(Object.keys(result.sessionTokens[0].fanzoneInfo).sort()).toEqual([
        'address',
        'city',
        'name',
      ]);
      expect(JSON.stringify(result)).not.toContain('coordinates');
    });

    it('returns checkedInAt as an ISO string rather than a Date', async () => {
      service.getUserCheckIns.mockResolvedValue([makeCheckin()]);

      const result = await controller.getMyCheckins(currentUser);

      expect(typeof result.sessionTokens[0].checkedInAt).toBe('string');
      expect(result.sessionTokens[0].checkedInAt).toBe(CREATED_AT);
    });

    it('returns an empty list for a fan who has never checked in', async () => {
      service.getUserCheckIns.mockResolvedValue([]);

      await expect(controller.getMyCheckins(currentUser)).resolves.toEqual({
        sessionTokens: [],
      });
    });

    it('preserves the order the service returned', async () => {
      // The service orders newest first; the mapper must not re-sort.
      service.getUserCheckIns.mockResolvedValue([
        makeCheckin({ sessionToken: 'token-newest' }),
        makeCheckin({ sessionToken: 'token-oldest' }),
      ]);

      const result = await controller.getMyCheckins(currentUser);

      expect(result.sessionTokens.map((item) => item.sessionToken)).toEqual([
        'token-newest',
        'token-oldest',
      ]);
    });

    it('is authenticated at class level, so a route added later is protected', () => {
      expect(
        Reflect.getMetadata('__guards__', UserCheckinsController),
      ).toBeDefined();
    });
  });
});
