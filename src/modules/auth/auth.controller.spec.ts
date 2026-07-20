import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../user/entities/user.entity';

const EMAIL = 'fan@worldcup.com';
const PASSWORD = 'Passw0rd!';

const TOKEN_RESPONSE: AuthResponseDto = {
  accessToken: 'signed.jwt.token',
  expiresIn: 3600,
  tokenType: 'Bearer',
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Pick<AuthService, 'register' | 'login'>>;

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
      login: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('register (EF-01)', () => {
    it('delegates the body to AuthService.register and returns its result', async () => {
      const dto = { email: EMAIL, password: PASSWORD };

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toBe(TOKEN_RESPONSE);
    });

    it('responds 201 Created (the @Post default, unaltered)', () => {
      // No @HttpCode on register → Nest applies the POST default of 201.
      const code = Reflect.getMetadata('__httpCode__', controller.register);
      expect(code).toBeUndefined();
    });
  });

  describe('login (EF-02)', () => {
    it('delegates the body to AuthService.login and returns its result', async () => {
      const dto = { email: EMAIL, password: PASSWORD };

      const result = await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toBe(TOKEN_RESPONSE);
    });

    it('overrides the status to 200 OK via @HttpCode', () => {
      // Without this override @Post would answer 201; login must answer 200.
      const code = Reflect.getMetadata('__httpCode__', controller.login);
      expect(code).toBe(HttpStatus.OK);
    });
  });

  describe('getProfile (EF-02)', () => {
    const user: AuthUser = { userId: 'user-uuid-1', email: EMAIL, role: UserRole.USER };

    it('returns only userId and email from the authenticated user', () => {
      expect(controller.getProfile(user)).toEqual({
        userId: 'user-uuid-1',
        email: EMAIL,
      });
    });

    it('never leaks the role (or any other field) in the profile response', () => {
      const profile = controller.getProfile(user);

      expect(Object.keys(profile).sort()).toEqual(['email', 'userId']);
      expect(profile).not.toHaveProperty('role');
    });
  });
});
