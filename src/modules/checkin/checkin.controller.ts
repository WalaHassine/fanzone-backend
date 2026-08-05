import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CheckinService } from './checkin.service';
import { CheckinEntity } from './entities/checkin.entity';
import {
  CheckinDetailDto,
  CheckinResponseDto,
  CheckoutDto,
  CreateCheckinDto,
  CrowdResponseDto,
} from './dto';
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
   * Projects a CheckinEntity onto the public detail shape.
   *
   * Field-by-field for the same reason `toResponseDto` is — a spread would carry
   * `userId` onto the wire, and `{ ...checkin.fanzone }` would carry the venue's
   * `capacity` and PostGIS `location` with it — and it matters more here, because
   * this one feeds an **unauthenticated** route. The service already declines to
   * select those columns; naming every field is the second lock.
   *
   * Deliberately separate from `UserCheckinsController.toUserCheckinsDto`, which
   * produces the same fields for the authenticated listing. Change both only on
   * purpose: a field that belongs on a caller's own check-in does not
   * automatically belong on an anonymous one.
   */
  private toDetailDto(checkin: CheckinEntity): CheckinDetailDto {
    return {
      sessionToken: checkin.sessionToken,
      fanzoneId: checkin.fanzoneId,
      fanzoneInfo: {
        name: checkin.fanzone.name,
        city: checkin.fanzone.city,
        address: checkin.fanzone.address,
      },
      teamName: checkin.team.name,
      checkedInAt: checkin.createdAt.toISOString(),
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

  /**
   * DELETE /checkins/:sessionToken — authenticated. The caller leaves a fan zone
   * and its spot is released (EF-10).
   *
   * The **path** token is the lookup key: it goes through `ParseUUIDPipe`, so a
   * malformed one is a 400 here rather than a driver error turned 500 further
   * down. The body's copy is a guard, checked for agreement below.
   *
   * `@Delete` answers 200 rather than 204 because there is a body to return.
   */
  @Delete(':sessionToken')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check out of a fan zone (authenticated fan)',
    description:
      "Removes the caller's check-in and gives its spot back to the venue. " +
      'A fan may only check themselves out. The JSON body is **required**: ' +
      'both fields are validated, and `fanzoneId` must match the fan zone the ' +
      'check-in was made at, so a stale token cannot free a spot elsewhere. ' +
      'Check-ins older than the presence window can still be checked out — ' +
      'they are no longer counted in the crowd, but they are still holding a ' +
      'spot.',
  })
  @ApiParam({
    name: 'sessionToken',
    format: 'uuid',
    description: 'Token identifying the check-in to remove',
  })
  @ApiBody({ type: CheckoutDto })
  @ApiResponse({
    status: 200,
    description: 'Checked out',
    schema: { example: { message: 'Checked out successfully' } },
  })
  @ApiResponse({
    status: 400,
    description:
      'Malformed token, missing body, path and body token disagree, or the check-in is not for that fan zone',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({
    status: 403,
    description: 'The check-in belongs to another user',
  })
  @ApiResponse({ status: 404, description: 'Check-in not found' })
  async checkout(
    @CurrentUser() user: AuthUser,
    @Param('sessionToken', ParseUUIDPipe) sessionToken: string,
    @Body() dto: CheckoutDto,
  ): Promise<{ message: string }> {
    // Whether two copies of the same value in one request agree is a question
    // about the request's shape, so it is answered here rather than in the
    // service. Case-insensitive for the same reason the service compares fan
    // zone ids that way: `@IsUUID('all')` accepts either case.
    if (dto.sessionToken.toLowerCase() !== sessionToken.toLowerCase()) {
      throw new BadRequestException(
        'sessionToken in the path and body must match',
      );
    }

    await this.checkinService.checkout(
      user.userId,
      sessionToken,
      dto.fanzoneId,
    );
    return { message: 'Checked out successfully' };
  }

  /**
   * GET /checkins/crowd/:fanzoneId — public. How busy a fan zone is right now
   * (EF-11), and how full (EF-12).
   *
   * Public, matching `GET /fanzones/:id/crowd`: the figures are aggregates with
   * no user data in them, which is the whole point of EF-11. This is the same
   * snapshot that endpoint returns, tagged with the fan zone id and the moment
   * it was computed.
   *
   * **Two paths, one handler.** `fanzone/:fanzoneId` is the path named in the
   * WBS; `crowd/:fanzoneId` is the one that describes the payload, which is a
   * crowd snapshot rather than a fan zone. Both are served so neither client
   * breaks.
   *
   * Declared above `GET /checkins/:sessionToken` as a convention, not a fix:
   * this project runs express@5 / path-to-regexp@8, where `:param` compiles to
   * `[^/]+` — one segment — so a two-segment path can never tie with a
   * one-segment one whatever the order. Keeping literals above the catch-all
   * keeps the invariant true if either pattern is ever shortened, and any
   * single-segment literal GET added later (`/checkins/active`) belongs here too.
   */
  @Get(['crowd/:fanzoneId', 'fanzone/:fanzoneId'])
  @ApiOperation({
    summary: 'Get the crowd at a fan zone (public)',
    description:
      'Counts everyone currently checked in, broken down by the team they ' +
      'support. Aggregated only — no user id, session token or any other ' +
      'per-person value is read or returned.',
  })
  @ApiParam({
    name: 'fanzoneId',
    format: 'uuid',
    description: 'UUID of the fan zone to describe',
  })
  @ApiResponse({
    status: 200,
    description: 'Crowd snapshot',
    type: CrowdResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed fan zone id' })
  @ApiResponse({ status: 404, description: 'Fan zone not found' })
  getCrowd(
    @Param('fanzoneId', ParseUUIDPipe) fanzoneId: string,
  ): Promise<CrowdResponseDto> {
    return this.checkinService.getCrowdStatus(fanzoneId);
  }

  /**
   * GET /checkins/:sessionToken — public. One check-in, by its token (EF-10).
   *
   * **Unauthenticated on purpose.** The token is the credential: an unguessable
   * v4 UUID unlocking a fan zone, a team and a time, and never a person
   * (ENF-05). That is what lets a venue scanner — which holds no fan's JWT —
   * verify a check-in at the gate. It is also why the token is redacted out of
   * the logs; see `redactPath`.
   *
   * `ParseUUIDPipe` is what turns a malformed token into a 400. Without it the
   * driver rejects the `uuid` cast and a client error is reported as a 500.
   *
   * Declared last: it is the catch-all single-segment GET on this controller.
   */
  @Get(':sessionToken')
  @ApiOperation({
    summary: 'Get a check-in by its session token (public)',
    description:
      'Returns the check-in identified by the token: the fan zone, the team ' +
      'being supported and when it was recorded. No authentication — the token ' +
      'itself is the credential, and the payload carries no user identifier. ' +
      'Not bounded by the presence window: a check-in that has aged out of the ' +
      'crowd count is still a real record and still resolves here.',
  })
  @ApiParam({
    name: 'sessionToken',
    format: 'uuid',
    description: 'Token identifying the check-in to read',
  })
  @ApiResponse({
    status: 200,
    description: 'The check-in',
    type: CheckinDetailDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed session token' })
  @ApiResponse({ status: 404, description: 'Check-in not found' })
  async getBySessionToken(
    @Param('sessionToken', ParseUUIDPipe) sessionToken: string,
  ): Promise<CheckinDetailDto> {
    const checkin =
      await this.checkinService.getCheckInBySessionToken(sessionToken);
    return this.toDetailDto(checkin);
  }
}
