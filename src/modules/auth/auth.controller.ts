import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  LoginDto,
  ProfileResponseDto,
  RegisterDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * AuthController
 *
 * HTTP surface for authentication (EF-01 registration, EF-02 login).
 * A thin delegation layer: business rules, hashing and token signing live in
 * AuthService; DTO validation is handled by the global ValidationPipe (a bad
 * body becomes a 400 before a handler runs).
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new account and returns an access token for immediate use.
   * Requirement: EF-01.
   */
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Account created; access token returned',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid payload or email already registered',
  })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * Authenticates an existing account and returns an access token.
   * Requirement: EF-02.
   *
   * `@HttpCode(200)` overrides the default 201 that @Post would otherwise send.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authenticated; access token returned',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials',
  })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  /**
   * Returns the identity of the caller carried in their verified JWT.
   * Requirement: EF-02 — confirms the request is authenticated.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The authenticated user',
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid or expired token',
  })
  getProfile(@CurrentUser() user: AuthUser): ProfileResponseDto {
    return { userId: user.userId, email: user.email };
  }
}
