import {
  Body,
  Controller,
  Get,
  NotFoundException,
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

import { RecommendationService } from './recommendation.service';
import {
  AlertSuggestionDto,
  RecommendationListDto,
  RecommendationRequestDto,
  RecommendationResponseDto,
} from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/decorators';
import { UserRole } from '../user/entities/user.entity';

/**
 * RecommendationController — REST surface for AI fan zone recommendations.
 *
 * Requirement: EF-13 — recommend a fan zone matching the user's profile.
 * Requirement: EF-14 — provide a textual explanation.
 * Requirement: EF-15 — suggest relevant alerts.
 * Requirement: ENF-01 — under three seconds.
 *
 * Every route is authenticated, and the user id always comes from the verified
 * token rather than the request: `RecommendationRequestDto` declares only
 * `matchId`, and the global pipe runs with `forbidNonWhitelisted`, so a
 * body-supplied `userId` is rejected outright instead of quietly ignored.
 *
 * The service already returns DTOs — unlike `CheckinController`, which projects
 * entities — because the mapping needs live distance and occupancy figures that
 * only the service can obtain. Nothing here reshapes a payload; the one piece of
 * HTTP-level policy is turning the service's `null` into a 404.
 *
 * **The model.** Recommendations and their explanations come from Groq, running
 * `llama-3.3-70b-versatile` by default and overridable through `GROQ_MODEL`.
 * Deliberately *not* `mixtral-8x7b-32768`, which is decommissioned and answers
 * `404 model_not_found` — earlier drafts of this API named it.
 *
 * **The budget.** ENF-01 caps the whole response at three seconds. That is the
 * response, not the model call: the service also loads the fan, the fixture and
 * the candidate zones, then writes a row. `GROQ_TIMEOUT` therefore defaults to
 * 2500 ms and the database work keeps the rest. Measured latency against the
 * live provider runs roughly 0.8–2 s. A repeat request inside the cache TTL
 * makes no provider call at all and returns in tens of milliseconds.
 *
 * **Degradation.** Every provider failure — bad key, rate limit, timeout,
 * network, provider 5xx, or a response that fails validation — is absorbed. The
 * caller still gets a 201 carrying the nearest open zone, a low confidence
 * score and a neutral explanation that names no provider. **No 5xx is ever
 * emitted for an AI failure**, which is why no 503 appears in any response table
 * below; the omission is the design, not an oversight. Availability of the
 * recommendation matters more to a fan standing in the street than its
 * cleverness does.
 */
@ApiTags('Recommendations')
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  /**
   * POST /recommendations/generate — authenticated (EF-13, EF-14).
   *
   * Answers with a recommendation younger than the cache TTL when one exists,
   * and otherwise asks the model. A provider failure is not an error here: the
   * service degrades to the nearest fan zone with a low confidence score, so the
   * fan always gets somewhere to watch the match.
   */
  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a fan zone recommendation for a match',
    description:
      "Recommends the fan zone that best fits the caller's favourite teams, " +
      'preferred ambiance and city, with a written explanation and a ' +
      'confidence score, both produced by Groq running ' +
      'llama-3.3-70b-versatile.\n\n' +
      'A recommendation generated in the last 15 minutes is reused rather ' +
      'than regenerated, and a reused one costs no provider call.\n\n' +
      'Typical latency is 0.8-2 s, inside the three-second ENF-01 budget; the ' +
      'model itself is capped at 2500 ms so the surrounding database work ' +
      'fits.\n\n' +
      'If the provider is unavailable, times out, or returns something that ' +
      'fails validation, this endpoint still answers 201: the nearest open ' +
      'venue is returned with a score of 0.3 and a neutral explanation that ' +
      'names no provider. It never answers 5xx because of the AI, which is ' +
      'why no 503 is listed below.',
  })
  @ApiBody({ type: RecommendationRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Recommendation generated or reused',
    type: RecommendationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed body, or no fan zone can be recommended',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'User or match not found' })
  async generate(
    @CurrentUser() user: AuthUser,
    @Body() dto: RecommendationRequestDto,
  ): Promise<RecommendationResponseDto> {
    return this.recommendationService.generateRecommendation(
      user.userId,
      dto.matchId,
    );
  }

  /**
   * GET /recommendations/me — authenticated (EF-13).
   *
   * One entry per match, newest first.
   *
   * Its position in the file is legibility, not routing: the parameterised
   * routes all sit under a literal `match/` segment, so `me` cannot be captured
   * by one of them whatever the declaration order. That is the reason `match/`
   * is there — a flat `:matchId` at this level would swallow `me`, and every
   * literal segment added here afterwards, unless each one were kept above it
   * forever.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's recommendation history",
    description:
      'The most recent recommendations made for the authenticated fan, one ' +
      'per match and newest first. Distance and occupancy are recomputed at ' +
      'read time, so they describe the venue now rather than when the ' +
      'recommendation was made.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recommendation history',
    type: RecommendationListDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async getMine(@CurrentUser() user: AuthUser): Promise<RecommendationListDto> {
    return this.recommendationService.getUserRecommendations(user.userId);
  }

  /**
   * GET /recommendations/match/:matchId — authenticated (EF-13).
   *
   * The stored recommendation, with no freshness check and no AI call. A fan
   * who wants a current one posts to `/generate`.
   */
  @Get('match/:matchId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The caller's stored recommendation for a match",
    description:
      'Returns the recommendation already held for this fan and match, ' +
      'without contacting the AI provider. 404 when none has been generated.',
  })
  @ApiParam({ name: 'matchId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Stored recommendation',
    type: RecommendationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed match id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({
    status: 404,
    description: 'No recommendation stored for this fan and match',
  })
  async getForMatch(
    @CurrentUser() user: AuthUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ): Promise<RecommendationResponseDto> {
    const recommendation = await this.recommendationService.getRecommendation(
      user.userId,
      matchId,
    );

    // The service reports "nothing stored" as null; whether that is a 404 is an
    // HTTP question, so it is answered here.
    if (!recommendation) {
      throw new NotFoundException('No recommendation found for this match');
    }

    return recommendation;
  }

  /**
   * GET /recommendations/match/:matchId/alerts — authenticated (EF-15).
   *
   * A proposal, not a subscription: nothing is stored, and the fan creates the
   * alert itself. Empty when no favourite team is playing, the match is more
   * than a week out or already kicked off, or an alert already exists.
   */
  @Get('match/:matchId/alerts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Suggest alert times for an upcoming match',
    description:
      "Proposes when to be reminded about a match one of the caller's " +
      'favourite teams is playing, within the next seven days. Only lead ' +
      'times still in the future are offered, each with the exact instant it ' +
      'would fire. Returns an empty array rather than an error when there is ' +
      'nothing worth suggesting.',
  })
  @ApiParam({ name: 'matchId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Suggested alerts, possibly empty',
    type: AlertSuggestionDto,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'Malformed match id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'User or match not found' })
  async suggestAlerts(
    @CurrentUser() user: AuthUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ): Promise<AlertSuggestionDto[]> {
    return this.recommendationService.suggestAlerts(user.userId, matchId);
  }

  /**
   * GET /recommendations/match/:matchId/all — admin only.
   *
   * Which fan zones the recommender is actually sending people to, most
   * confident first. Admin-gated because it spans every fan's recommendations;
   * the payload still carries no user identifiers, since
   * `RecommendationResponseDto` declares none.
   */
  @Get('match/:matchId/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'All recommendations made for a match (admin)',
    description:
      'Every recommendation generated for this match across all fans, ' +
      'ordered by confidence score descending. Intended for analytics — which ' +
      'venues the recommender favours. No user identifiers are included.',
  })
  @ApiParam({ name: 'matchId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Recommendations for the match',
    type: RecommendationListDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed match id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async getAllForMatch(
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ): Promise<RecommendationListDto> {
    return this.recommendationService.getRecommendationsForMatch(matchId);
  }
}
