import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, ObjectLiteral, Repository } from 'typeorm';

import { UserService } from './user.service';
import { UserEntity, UserRole } from './entities/user.entity';
import {
  AmbiancePreference,
  UserPreferenceEntity,
} from './entities/user-preference.entity';
import { TeamEntity } from '../match/entities/team.entity';

const USER_ID = 'user-uuid-1';
const EMAIL = 'fan@worldcup.com';
const CITY = 'Doha';
const TEAM_A = { id: 'team-uuid-a', name: 'France' } as TeamEntity;
const TEAM_B = { id: 'team-uuid-b', name: 'Tunisia' } as TeamEntity;

type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'find' | 'create' | 'save'>
>;

describe('UserService', () => {
  let service: UserService;
  let userRepo: RepoMock<UserEntity>;
  let preferenceRepo: RepoMock<UserPreferenceEntity>;
  let teamRepo: RepoMock<TeamEntity>;

  /** Builds a persisted-looking user with populated relations. */
  function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
    return {
      id: USER_ID,
      email: EMAIL,
      passwordHash: '$2b$10$hash',
      role: UserRole.USER,
      isActive: true,
      createdAt: new Date('2026-07-21T12:00:00.000Z'),
      preferences: undefined,
      favoriteTeams: [],
      ...overrides,
    } as UserEntity;
  }

  beforeEach(async () => {
    userRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() };
    preferenceRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() };
    teamRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(UserPreferenceEntity), useValue: preferenceRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findById', () => {
    it('queries by id and requests the profile relations', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.findById(USER_ID);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID },
        relations: { preferences: true, favoriteTeams: true },
      });
      expect(result).toBe(user);
    });

    it('returns null when the user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.findById(USER_ID)).resolves.toBeNull();
    });
  });

  describe('updatePreferences (EF-04, EF-05)', () => {
    it('partially updates an existing preferences row without touching other fields', async () => {
      const existing = {
        id: 'pref-1',
        userId: USER_ID,
        city: 'Paris',
        favoriteAmbiance: AmbiancePreference.CALM,
      } as UserPreferenceEntity;
      preferenceRepo.findOne.mockResolvedValue(existing);
      preferenceRepo.save.mockImplementation(async (p) => p as UserPreferenceEntity);

      const result = await service.updatePreferences(USER_ID, { city: CITY });

      expect(result.city).toBe(CITY);
      // ambiance left as-is on a city-only update
      expect(result.favoriteAmbiance).toBe(AmbiancePreference.CALM);
      expect(preferenceRepo.create).not.toHaveBeenCalled();
    });

    it('creates a new preferences row when none exists', async () => {
      preferenceRepo.findOne.mockResolvedValue(null);
      preferenceRepo.create.mockImplementation((p) => p as UserPreferenceEntity);
      preferenceRepo.save.mockImplementation(async (p) => p as UserPreferenceEntity);

      const result = await service.updatePreferences(USER_ID, {
        city: CITY,
        favoriteAmbiance: AmbiancePreference.SUPPORTERS,
      });

      expect(preferenceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, city: CITY }),
      );
      expect(result.city).toBe(CITY);
      expect(result.favoriteAmbiance).toBe(AmbiancePreference.SUPPORTERS);
    });

    it('rejects first-time creation without a city (city is NOT NULL)', async () => {
      preferenceRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updatePreferences(USER_ID, {
          favoriteAmbiance: AmbiancePreference.FAMILY,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(preferenceRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('maps the entity to a UserResponseDto with team names and preferences', async () => {
      const user = makeUser({
        favoriteTeams: [TEAM_A, TEAM_B],
        preferences: {
          city: CITY,
          favoriteAmbiance: AmbiancePreference.ANIMATED,
        } as UserPreferenceEntity,
      });
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.getProfile(USER_ID);

      expect(result).toEqual({
        id: USER_ID,
        email: EMAIL,
        role: UserRole.USER,
        favoriteTeams: ['France', 'Tunisia'],
        preferences: { city: CITY, favoriteAmbiance: AmbiancePreference.ANIMATED },
        createdAt: user.createdAt,
      });
    });

    it('returns preferences as null for a user who has none', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ preferences: undefined }));

      const result = await service.getProfile(USER_ID);

      expect(result.preferences).toBeNull();
      expect(result.favoriteTeams).toEqual([]);
    });

    it('never exposes passwordHash in the response (ENF-03)', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      const result = await service.getProfile(USER_ID);

      expect(result).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(result)).not.toContain('$2b$');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.getProfile(USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setFavoriteTeams (EF-03)', () => {
    it('loads all teams in a single In() query and saves them on the user (no N+1)', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      teamRepo.find.mockResolvedValue([TEAM_A, TEAM_B]);
      userRepo.save.mockImplementation(async (u) => u as UserEntity);

      await service.setFavoriteTeams(USER_ID, [TEAM_A.id, TEAM_B.id]);

      expect(teamRepo.find).toHaveBeenCalledTimes(1);
      expect(teamRepo.find).toHaveBeenCalledWith({
        where: { id: In([TEAM_A.id, TEAM_B.id]) },
      });
      expect(user.favoriteTeams).toEqual([TEAM_A, TEAM_B]);
      expect(userRepo.save).toHaveBeenCalledWith(user);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setFavoriteTeams(USER_ID, [TEAM_A.id]),
      ).rejects.toThrow(NotFoundException);
      expect(teamRepo.find).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when any teamId does not exist', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      teamRepo.find.mockResolvedValue([TEAM_A]); // only one of two resolves

      await expect(
        service.setFavoriteTeams(USER_ID, [TEAM_A.id, 'missing-team']),
      ).rejects.toThrow(NotFoundException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });
});
