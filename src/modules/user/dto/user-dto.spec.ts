import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateUserDto } from './create-user.dto';
import { UserPreferenceDto } from './user-preference.dto';
import { UpdateUserPreferenceDto } from './update-user-preference.dto';
import { SetFavoriteTeamsDto } from './set-favorite-teams.dto';
import { UserRole } from '../entities/user.entity';
import { AmbiancePreference } from '../entities/user-preference.entity';

type Ctor<T> = new () => T;

function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const EMAIL = 'fan@worldcup.com';
const CITY = 'Doha';
const UUID_A = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const UUID_B = '7a1e2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';

describe('CreateUserDto', () => {
  it('accepts a minimal payload (role and passwordHash optional)', () => {
    expect(errorsFor(CreateUserDto, { email: EMAIL })).toEqual([]);
  });

  it('accepts an explicit valid role', () => {
    expect(
      errorsFor(CreateUserDto, { email: EMAIL, role: UserRole.ADMIN }),
    ).toEqual([]);
  });

  it('rejects a malformed email', () => {
    expect(errorsFor(CreateUserDto, { email: 'not-an-email' })).toContain(
      'Email must be a valid email address',
    );
  });

  it('rejects an unknown role', () => {
    expect(
      errorsFor(CreateUserDto, { email: EMAIL, role: 'SUPERADMIN' }),
    ).toContain('Role must be one of: ADMIN, USER');
  });
});

describe('UserPreferenceDto (EF-04, EF-05)', () => {
  it('accepts a valid city and ambiance', () => {
    expect(
      errorsFor(UserPreferenceDto, {
        city: CITY,
        favoriteAmbiance: AmbiancePreference.CALM,
      }),
    ).toEqual([]);
  });

  it.each([['CALM'], ['FAMILY'], ['ANIMATED'], ['SUPPORTERS']])(
    'accepts every allowed ambiance value: %s',
    (favoriteAmbiance) => {
      expect(
        errorsFor(UserPreferenceDto, { city: CITY, favoriteAmbiance }),
      ).toEqual([]);
    },
  );

  it('rejects an empty city (EF-04)', () => {
    expect(
      errorsFor(UserPreferenceDto, {
        city: '',
        favoriteAmbiance: AmbiancePreference.CALM,
      }),
    ).toContain('City is required');
  });

  it('rejects a city longer than 255 characters (EF-04)', () => {
    expect(
      errorsFor(UserPreferenceDto, {
        city: 'x'.repeat(256),
        favoriteAmbiance: AmbiancePreference.CALM,
      }),
    ).toContain('City must be at most 255 characters long');
  });

  it('rejects an ambiance outside the enum (EF-05)', () => {
    expect(
      errorsFor(UserPreferenceDto, { city: CITY, favoriteAmbiance: 'PARTY' }),
    ).toContain('Ambiance must be one of: CALM, FAMILY, ANIMATED, SUPPORTERS');
  });
});

describe('UpdateUserPreferenceDto (EF-04, EF-05)', () => {
  it('accepts a city-only update', () => {
    expect(errorsFor(UpdateUserPreferenceDto, { city: CITY })).toEqual([]);
  });

  it('accepts an ambiance-only update', () => {
    expect(
      errorsFor(UpdateUserPreferenceDto, {
        favoriteAmbiance: AmbiancePreference.FAMILY,
      }),
    ).toEqual([]);
  });

  it('rejects an empty body — at least one field must be provided', () => {
    expect(errorsFor(UpdateUserPreferenceDto, {})).toContain(
      'At least one of city, favoriteAmbiance must be provided',
    );
  });

  it('still rejects an invalid ambiance when present (EF-05)', () => {
    expect(
      errorsFor(UpdateUserPreferenceDto, { favoriteAmbiance: 'PARTY' }),
    ).toContain('Ambiance must be one of: CALM, FAMILY, ANIMATED, SUPPORTERS');
  });
});

describe('SetFavoriteTeamsDto (EF-03)', () => {
  it.each([
    ['a single team', [UUID_A]],
    ['several teams', [UUID_A, UUID_B]],
  ])('accepts %s', (_label, teamIds) => {
    expect(errorsFor(SetFavoriteTeamsDto, { teamIds })).toEqual([]);
  });

  it('rejects an empty array', () => {
    expect(errorsFor(SetFavoriteTeamsDto, { teamIds: [] })).toContain(
      'At least one team ID is required',
    );
  });

  it('rejects a non-UUID element', () => {
    expect(
      errorsFor(SetFavoriteTeamsDto, { teamIds: [UUID_A, 'not-a-uuid'] }),
    ).toContain('Each team ID must be a valid UUID');
  });

  it('rejects a non-array value', () => {
    expect(errorsFor(SetFavoriteTeamsDto, { teamIds: UUID_A })).toContain(
      'teamIds must be an array',
    );
  });
});
