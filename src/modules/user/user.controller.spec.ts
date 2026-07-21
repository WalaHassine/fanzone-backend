import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRole } from './entities/user.entity';
import {
  AmbiancePreference,
  UserPreferenceEntity,
} from './entities/user-preference.entity';
import { UserResponseDto } from './dto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

const USER: AuthUser = {
  userId: 'user-uuid-1',
  email: 'fan@worldcup.com',
  role: UserRole.USER,
};

const PROFILE: UserResponseDto = {
  id: USER.userId,
  email: USER.email,
  role: UserRole.USER,
  favoriteTeams: ['France', 'Tunisia'],
  preferences: { city: 'Doha', favoriteAmbiance: AmbiancePreference.ANIMATED },
  createdAt: new Date('2026-07-21T12:00:00.000Z'),
};

describe('UserController', () => {
  let controller: UserController;
  let userService: jest.Mocked<
    Pick<UserService, 'getProfile' | 'updatePreferences' | 'setFavoriteTeams'>
  >;

  beforeEach(async () => {
    userService = {
      getProfile: jest.fn().mockResolvedValue(PROFILE),
      updatePreferences: jest.fn(),
      setFavoriteTeams: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getMe (EF-03, EF-04, EF-05)', () => {
    it('returns the profile for the authenticated user', async () => {
      const result = await controller.getMe(USER);

      expect(userService.getProfile).toHaveBeenCalledWith(USER.userId);
      expect(result).toBe(PROFILE);
    });
  });

  describe('updatePreferences (EF-04, EF-05)', () => {
    it('passes the userId and dto to the service', async () => {
      userService.updatePreferences.mockResolvedValue({
        id: 'pref-1',
        userId: USER.userId,
        city: 'Doha',
        favoriteAmbiance: AmbiancePreference.CALM,
      } as UserPreferenceEntity);

      const dto = { city: 'Doha' };
      await controller.updatePreferences(USER, dto);

      expect(userService.updatePreferences).toHaveBeenCalledWith(USER.userId, dto);
    });

    it('returns only the mapped preference fields — no userId or timestamps leak', async () => {
      userService.updatePreferences.mockResolvedValue({
        id: 'pref-1',
        userId: USER.userId,
        city: 'Doha',
        favoriteAmbiance: AmbiancePreference.CALM,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as UserPreferenceEntity);

      const result = await controller.updatePreferences(USER, {
        favoriteAmbiance: AmbiancePreference.CALM,
      });

      expect(result).toEqual({ city: 'Doha', favoriteAmbiance: AmbiancePreference.CALM });
      expect(Object.keys(result).sort()).toEqual(['city', 'favoriteAmbiance']);
    });
  });

  describe('setFavoriteTeams (EF-03)', () => {
    it('passes userId and the teamIds array to the service and returns a message', async () => {
      const dto = { teamIds: ['team-a', 'team-b'] };

      const result = await controller.setFavoriteTeams(USER, dto);

      expect(userService.setFavoriteTeams).toHaveBeenCalledWith(USER.userId, dto.teamIds);
      expect(result).toEqual({ message: 'Favorite teams updated' });
    });

    it('responds with 200, not the default 201 for POST', () => {
      // @HttpCode(200) overrides the create-default so this reads as a replace.
      const code = Reflect.getMetadata('__httpCode__', controller.setFavoriteTeams);
      expect(code).toBe(HttpStatus.OK);
    });
  });
});
