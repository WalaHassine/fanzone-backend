import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CheckinService } from './checkin.service';
import { CheckinEntity } from './entities/checkin.entity';
import { CheckinResponseDto, CreateCheckinDto } from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';

/**
 * CheckinController — REST surface for checking in to a fan zone.
 *
 * Requirement: EF-10 — a fan checks in to a fan zone.
 * Requirement: ENF-05 — no user identifier is returned.
 *
 * Authenticated but **not** admin-gated: checking in is what an ordinary fan
 * does. `JwtAuthGuard` is what makes `@CurrentUser()` meaningful — the identity
 * is taken from the verified token, so the body cannot name a different user.
 *
 * The service returns entities; this controller projects them to
 * `CheckinResponseDto`, which is where the stored `userId` stops.
 */
@ApiTags('CheckIns')
@Controller('checkins')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  /**
   * Projects a CheckinEntity onto the public shape.
   *
   * Written field-by-field rather than by spreading the entity: a spread would
   * carry `userId` — and the eager `fanzone`/`team` relations — onto the wire the
   * moment the entity gained a field, which is precisely the leak ENF-05 forbids.
   */
  private toResponseDto(checkin: CheckinEntity): CheckinResponseDto {
    return {
      sessionToken: checkin.sessionToken,
      fanzoneId: checkin.fanzoneId,
      // `CheckinService.create` attaches the team it loaded, so this needs no
      // extra query. The response exposes the name rather than the id.
      teamName: checkin.team.name,
      createdAt: checkin.createdAt.toISOString(),
    };
  }

  /**
   * POST /checkins — authenticated. Records the caller's presence (EF-10).
   *
   * The caller supplies only the fan zone and the team they support; the user id
   * comes from the token. The response carries a `sessionToken` in place of any
   * user identifier.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check in to a fan zone (authenticated fan)',
    description:
      'Records the authenticated user as present at a fan zone in support of ' +
      'one team, and takes a spot off the venue. The team must be broadcast ' +
      'there, and a user may only be checked in to a given fan zone once ' +
      'within the presence window. The response identifies the check-in by an ' +
      'opaque session token — never by a user id.',
  })
  @ApiResponse({
    status: 201,
    description: 'Check-in recorded',
    type: CheckinResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid data, team not broadcast at this fan zone, fan zone full, or already checked in',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'Fan zone or team not found' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckinDto,
  ): Promise<CheckinResponseDto> {
    const checkin = await this.checkinService.create(user.userId, dto);
    return this.toResponseDto(checkin);
  }
}
