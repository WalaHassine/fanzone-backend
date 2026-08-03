import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CheckinService } from './checkin.service';
import { CheckinEntity } from './entities/checkin.entity';
import { UserCheckinsDto } from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';

/**
 * UserCheckinsController — the authenticated fan's own check-ins.
 *
 * Requirement: EF-10 — the check-in lifecycle, from the fan's side.
 * Requirement: ENF-05 — no user identifier is returned.
 *
 * **Why a `/users`-prefixed controller lives in the check-in module.** The route
 * is specified as `GET /users/checkins`, but the data, the service and the DTO
 * projection all belong here. Hanging the handler off `UserController` instead
 * would force `UserModule` to import `CheckinModule`, and `CheckinModule`
 * already imports `UserModule` — a cycle needing `forwardRef` on both sides, for
 * one route. Nest is happy to route two controllers under the same prefix, so
 * this class takes the whole path and the module graph stays acyclic.
 *
 * One consequence to know about: controllers register in module-import order, and
 * `AppModule` imports `UserModule` before `CheckinModule`. `UserController` has
 * only literal paths today, so nothing shadows `users/checkins` — but a
 * `@Get(':id')` added there later would register first and swallow it. Same
 * hazard, and the same reason for the ordering note, as `FanzoneController`'s
 * `:id/crowd`.
 *
 * Guarded at class level rather than per handler: there is no public route here,
 * so a route added later is protected by default. That is also what makes
 * `@CurrentUser()` meaningful — the rows returned are selected by the id on the
 * verified token, never by anything the caller supplies.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/checkins')
export class UserCheckinsController {
  constructor(private readonly checkinService: CheckinService) {}

  /**
   * Projects check-in entities onto the public listing shape.
   *
   * Written field-by-field rather than by spreading, for the same reason
   * `CheckinController.toResponseDto` is: a spread would carry `userId` onto the
   * wire, and `{ ...checkin.fanzone }` would carry the venue's `capacity` and
   * PostGIS `location` with it. Naming every field means a new column on either
   * entity cannot leak by default — which is exactly the guarantee ENF-05 asks
   * for.
   */
  private toUserCheckinsDto(checkins: CheckinEntity[]): UserCheckinsDto {
    return {
      sessionTokens: checkins.map((checkin) => ({
        sessionToken: checkin.sessionToken,
        fanzoneId: checkin.fanzoneId,
        fanzoneInfo: {
          name: checkin.fanzone.name,
          city: checkin.fanzone.city,
          address: checkin.fanzone.address,
        },
        teamName: checkin.team.name,
        checkedInAt: checkin.createdAt.toISOString(),
      })),
    };
  }

  /**
   * GET /users/checkins — authenticated. The caller's own check-ins, newest
   * first (EF-10).
   *
   * The listing is not bounded by the presence window: it is history, and it is
   * how a fan recovers a session token they no longer have — the only way to
   * check out and release the spot that check-in is still holding.
   *
   * The service decides the order; this handler does not re-sort.
   */
  @Get()
  @ApiOperation({
    summary: "Get the current user's check-ins",
    description:
      'Returns every check-in belonging to the authenticated fan, newest ' +
      'first, each identified by its session token and carrying enough of the ' +
      'fan zone to render it. Rows are selected by the id on the verified ' +
      'token, so a fan only ever sees their own, and the payload carries no ' +
      'user identifier.',
  })
  @ApiResponse({
    status: 200,
    description: "The caller's check-ins",
    type: UserCheckinsDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async getMyCheckins(@CurrentUser() user: AuthUser): Promise<UserCheckinsDto> {
    const checkins = await this.checkinService.getUserCheckIns(user.userId);
    return this.toUserCheckinsDto(checkins);
  }
}
