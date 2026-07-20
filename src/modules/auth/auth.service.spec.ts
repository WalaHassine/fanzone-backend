import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AuthService, SALT_ROUNDS } from './auth.service';
import { UserService } from '../user/user.service';
import { UserEntity, UserRole } from '../user/entities/user.entity';

const EMAIL = 'fan@worldcup.com';
const PASSWORD = 'Passw0rd!';
const EXPIRES_IN = 3600;
const SIGNED_TOKEN = 'signed.jwt.token';

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<Pick<UserService, 'findByEmail' | 'createUser'>>;
  let jwtService: { sign: jest.Mock };

  /** Builds a persisted-looking user with a real bcrypt hash of `password`. */
  async function makeUser(
    email = EMAIL,
    password = PASSWORD,
    role = UserRole.USER,
  ): Promise<UserEntity> {
    return {
      id: 'user-uuid-1',
      email,
      passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
      role,
      isActive: true,
    } as UserEntity;
  }

  beforeEach(async () => {
    userService = {
      findByEmail: jest.fn().mockResolvedValue(null),
      createUser: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue(SIGNED_TOKEN) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(EXPIRES_IN) } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('register (EF-01)', () => {
    beforeEach(() => {
      userService.createUser.mockImplementation(
        async (email: string, passwordHash: string) =>
          ({ id: 'user-uuid-1', email, passwordHash, role: UserRole.USER } as UserEntity),
      );
    });

    it('stores the password bcrypt-hashed, never in plaintext (ENF-03)', async () => {
      await service.register({ email: EMAIL, password: PASSWORD });

      const [, storedHash] = userService.createUser.mock.calls[0];
      expect(storedHash).not.toBe(PASSWORD);
      expect(storedHash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
      await expect(bcrypt.compare(PASSWORD, storedHash)).resolves.toBe(true);
    });

    it('creates the user with the USER role', async () => {
      await service.register({ email: EMAIL, password: PASSWORD });

      const created = await userService.createUser.mock.results[0].value;
      expect(created.role).toBe(UserRole.USER);
    });

    it('normalizes the email to lowercase before lookup and creation', async () => {
      await service.register({ email: '  FAN@WorldCup.COM  ', password: PASSWORD });

      expect(userService.findByEmail).toHaveBeenCalledWith(EMAIL);
      expect(userService.createUser.mock.calls[0][0]).toBe(EMAIL);
    });

    it('throws BadRequestException when the email is already registered', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser());

      await expect(service.register({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
        BadRequestException,
      );
      expect(userService.createUser).not.toHaveBeenCalled();
    });

    it('returns only accessToken, expiresIn and tokenType — no password data', async () => {
      const result = await service.register({ email: EMAIL, password: PASSWORD });

      expect(Object.keys(result).sort()).toEqual(['accessToken', 'expiresIn', 'tokenType']);
      expect(JSON.stringify(result)).not.toContain(PASSWORD);
      expect(JSON.stringify(result)).not.toContain('$2b$');
    });
  });

  describe('login (EF-02)', () => {
    it('returns a token when the credentials are correct', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser());

      const result = await service.login({ email: EMAIL, password: PASSWORD });

      expect(result).toEqual({
        accessToken: SIGNED_TOKEN,
        expiresIn: EXPIRES_IN,
        tokenType: 'Bearer',
      });
    });

    it('normalizes the email to lowercase before lookup', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser());

      await service.login({ email: '  FAN@WorldCup.COM  ', password: PASSWORD });

      expect(userService.findByEmail).toHaveBeenCalledWith(EMAIL);
    });

    it('throws UnauthorizedException when the email is unknown', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser());

      await expect(
        service.login({ email: EMAIL, password: 'Wr0ngPass!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('uses an identical message for unknown email and wrong password', async () => {
      userService.findByEmail.mockResolvedValue(null);
      const unknownEmail = await service.login({ email: EMAIL, password: PASSWORD }).catch((e) => e);

      userService.findByEmail.mockResolvedValue(await makeUser());
      const wrongPassword = await service
        .login({ email: EMAIL, password: 'Wr0ngPass!' })
        .catch((e) => e);

      // A differing message would let an attacker enumerate registered emails.
      expect(unknownEmail.message).toBe(wrongPassword.message);
    });

    it('still spends bcrypt time when no user exists (timing resistance)', async () => {
      // bcrypt's exports are non-configurable, so jest.spyOn cannot observe the
      // call. Assert the observable property instead: a real bcrypt comparison
      // at cost factor 10 takes tens of milliseconds, whereas returning early
      // without comparing would finish in well under a millisecond.
      userService.findByEmail.mockResolvedValue(null);

      const start = Date.now();
      await service.login({ email: EMAIL, password: PASSWORD }).catch(() => undefined);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThan(20);
    });

    it('returns only accessToken, expiresIn and tokenType — no password data', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser());

      const result = await service.login({ email: EMAIL, password: PASSWORD });

      expect(Object.keys(result).sort()).toEqual(['accessToken', 'expiresIn', 'tokenType']);
      expect(JSON.stringify(result)).not.toContain(PASSWORD);
    });
  });

  describe('generateTokens (EF-02)', () => {
    it('signs the { sub, email, role } payload JwtStrategy expects', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser(EMAIL, PASSWORD, UserRole.ADMIN));

      await service.login({ email: EMAIL, password: PASSWORD });

      // Contract with JwtStrategy.validate() — a plural `roles` array here
      // would leave req.user.role undefined on every request.
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-uuid-1',
        email: EMAIL,
        role: UserRole.ADMIN,
      });
    });

    it('reports the expiration from the jwt config namespace', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser());

      const result = await service.login({ email: EMAIL, password: PASSWORD });

      expect(result.expiresIn).toBe(EXPIRES_IN);
    });

    it('does not override the expiration configured on JwtModule', async () => {
      userService.findByEmail.mockResolvedValue(await makeUser());

      await service.login({ email: EMAIL, password: PASSWORD });

      // sign() must be called with the payload only; passing signOptions here
      // would create a second source of truth for token lifetime.
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
      expect(jwtService.sign.mock.calls[0]).toHaveLength(1);
    });
  });
});
