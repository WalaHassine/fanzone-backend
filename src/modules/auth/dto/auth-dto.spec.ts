import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';
import { parseDurationToSeconds } from '../../../config/jwt.config';

type Ctor<T> = new () => T;

function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const EMAIL = 'fan@worldcup.com';

describe('RegisterDto (EF-01)', () => {
  it('accepts a password meeting every strength requirement', () => {
    expect(
      errorsFor(RegisterDto, { email: EMAIL, password: 'Passw0rd!' }),
    ).toEqual([]);
  });

  it('accepts special characters outside the required set', () => {
    // The regex requires one of @$!%*?& but does not restrict the alphabet.
    expect(
      errorsFor(RegisterDto, { email: EMAIL, password: 'Passw0rd!#-' }),
    ).toEqual([]);
  });

  it.each([
    ['no uppercase, digit or special', 'password'],
    ['no special character', 'Passw0rd'],
    ['no digit', 'Password!'],
    ['no uppercase', 'passw0rd!'],
    ['no lowercase', 'PASSW0RD!'],
  ])('rejects a weak password: %s', (_label, password) => {
    expect(errorsFor(RegisterDto, { email: EMAIL, password })).toContain(
      'Password must contain at least one uppercase letter, one lowercase letter, ' +
        'one number and one special character (@$!%*?&)',
    );
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(
      errorsFor(RegisterDto, { email: EMAIL, password: 'Pass0!' }),
    ).toContain('Password must be at least 8 characters long');
  });

  it('rejects a malformed email', () => {
    expect(
      errorsFor(RegisterDto, { email: 'not-an-email', password: 'Passw0rd!' }),
    ).toContain('Email must be a valid email address');
  });
});

describe('LoginDto (EF-02)', () => {
  it.each([['password'], ['Passw0rd'], ['12345678']])(
    'accepts any password format of sufficient length: %s',
    (password) => {
      expect(errorsFor(LoginDto, { email: EMAIL, password })).toEqual([]);
    },
  );

  it('still enforces the minimum length', () => {
    expect(errorsFor(LoginDto, { email: EMAIL, password: 'Pass0!' })).toContain(
      'Password must be at least 8 characters long',
    );
  });

  it('still enforces email format', () => {
    expect(
      errorsFor(LoginDto, { email: 'nope', password: 'password' }),
    ).toContain('Email must be a valid email address');
  });
});

describe('parseDurationToSeconds (EF-02)', () => {
  it.each([
    ['1h', 3600],
    ['15m', 900],
    ['30s', 30],
    ['7d', 604800],
    ['3600', 3600],
  ])('converts %s to %i seconds', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it.each([['abc'], ['1y'], [''], ['1 h']])(
    'throws on unparseable value: "%s"',
    (input) => {
      expect(() => parseDurationToSeconds(input)).toThrow(
        /Invalid JWT_EXPIRATION/,
      );
    },
  );
});
