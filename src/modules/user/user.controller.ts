import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { UserService } from './user.service';
import {
  SetFavoriteTeamsDto,
  UpdateUserPreferenceDto,
  UserPreferenceDto,
  UserResponseDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * UserController
 *
 * HTTP surface for a fan managing their own account: viewing their profile
 * (EF-03/EF-04/EF-05), setting city + ambiance preferences (EF-04, EF-05) and
 * choosing favourite teams (EF-03).
 *
 * Every route is authenticated: `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()`
 * are applied at the class level rather than per-handler, since there is no
 * public endpoint here — a new route is protected by default. The identity
 * comes from the verified JWT via `@CurrentUser()`, never from the request body,
 * so a caller can only ever act on their own account.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Returns the authenticated user's profile: identity, role, favourite team
   * names and preferences. Requirements: EF-03, EF-04, EF-05 (view own profile).
   */
  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The authenticated user profile',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid or expired token',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  getMe(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.userService.getProfile(user.userId);
  }

  /**
   * Creates or partially updates the caller's city + ambiance preferences.
   * Requirements: EF-04 (location), EF-05 (ambiance).
   *
   * Returns the meaningful preference fields only (mapped to UserPreferenceDto),
   * matching how preferences appear inside the profile and keeping internal
   * columns (id, userId, timestamps) out of the response.
   */
  @Patch('preferences')
  @ApiOperation({ summary: 'Update the current user preferences' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Preferences updated',
    type: UserPreferenceDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid body, or city required when setting preferences the first time',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid or expired token',
  })
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateUserPreferenceDto,
  ): Promise<UserPreferenceDto> {
    const pref = await this.userService.updatePreferences(user.userId, dto);
    return { city: pref.city, favoriteAmbiance: pref.favoriteAmbiance };
  }

  /**
   * Replaces the caller's set of favourite teams. Requirement: EF-03.
   *
   * `@HttpCode(200)` overrides the 201 that `@Post` would otherwise send — this
   * replaces a collection rather than creating a new resource.
   */
  @Post('favorite-teams')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the current user favourite teams' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Favorite teams updated',
    schema: { example: { message: 'Favorite teams updated' } },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid team IDs',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid or expired token',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'One or more teams not found',
  })
  async setFavoriteTeams(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetFavoriteTeamsDto,
  ): Promise<{ message: string }> {
    await this.userService.setFavoriteTeams(user.userId, dto.teamIds);
    return { message: 'Favorite teams updated' };
  }
}
