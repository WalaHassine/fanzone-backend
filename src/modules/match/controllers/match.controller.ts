import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { MatchService } from '../services/match.service';
import { MatchEntity } from '../entities/match.entity';
import { CreateMatchDto } from '../dto/create-match.dto';
import { UpdateMatchDto } from '../dto/update-match.dto';
import { MatchFilterDto } from '../dto/match-filter.dto';
import { MatchResponseDto } from '../dto/match-response.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles } from '../../../common/decorators';
import { UserRole } from '../../user/entities/user.entity';

/**
 * MatchController — REST endpoints for match management.
 *
 * Requirement: EF-06 — list matches.
 * Requirement: EF-07 — filter matches by team.
 * Requirement: EF-17 — admin match CRUD.
 *
 * Reads (`GET`) are public; writes (`POST`/`PATCH`) are admin-only, gated by
 * `JwtAuthGuard` (populates `request.user`) then `RolesGuard` (`@Roles(ADMIN)`).
 * The service returns entities; this controller projects them to
 * `MatchResponseDto` so credential-free, client-ready shapes leave the API.
 */
@ApiTags('Matches')
@Controller('matches')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  /**
   * Projects a MatchEntity (with its eager home/away teams) onto the public
   * response shape. `matchDate` is a Date on the entity but an ISO string on the
   * wire, hence `.toISOString()`.
   */
  private toResponseDto(match: MatchEntity): MatchResponseDto {
    return {
      id: match.id,
      homeTeam: {
        id: match.homeTeam.id,
        name: match.homeTeam.name,
        code: match.homeTeam.code,
      },
      awayTeam: {
        id: match.awayTeam.id,
        name: match.awayTeam.name,
        code: match.awayTeam.code,
      },
      matchDate: match.matchDate.toISOString(),
      stadium: match.stadium,
      status: match.status,
    };
  }

  /**
   * GET /matches — public. Lists matches, optionally filtered by team name,
   * date range and status (EF-06, EF-07). The filter fields auto-document as
   * query parameters via MatchFilterDto's Swagger metadata.
   */
  @Get()
  @ApiOperation({ summary: 'List matches with optional filters (public)' })
  @ApiResponse({
    status: 200,
    description: 'Matches ordered chronologically by kick-off',
    type: [MatchResponseDto],
  })
  async findAll(@Query() filter: MatchFilterDto): Promise<MatchResponseDto[]> {
    const matches = await this.matchService.findAll(filter);
    return matches.map((match) => this.toResponseDto(match));
  }

  /**
   * GET /matches/:id — public. Returns a single match with its team details.
   *
   * @throws {NotFoundException} if no match has the given id.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single match by id (public)' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the match',
    example: 'b2c4d6e8-0a1b-4c3d-9e8f-1a2b3c4d5e6f',
  })
  @ApiResponse({
    status: 200,
    description: 'The requested match',
    type: MatchResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MatchResponseDto> {
    const match = await this.matchService.findById(id);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    return this.toResponseDto(match);
  }

  /**
   * POST /matches — admin only (EF-17). Creates a match.
   *
   * The service validates team existence and the future-date rule, throwing
   * NotFoundException / BadRequestException respectively.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a match (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Match created',
    type: MatchResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid data or past match date' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'One or more teams not found' })
  async create(@Body() dto: CreateMatchDto): Promise<MatchResponseDto> {
    const match = await this.matchService.create(dto);
    return this.toResponseDto(match);
  }

  /**
   * PATCH /matches/:id — admin only (EF-17). Applies a partial update.
   *
   * @throws {NotFoundException} if the match (or a newly referenced team) is missing.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a match (admin only)' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the match',
    example: 'b2c4d6e8-0a1b-4c3d-9e8f-1a2b3c4d5e6f',
  })
  @ApiResponse({
    status: 200,
    description: 'Match updated',
    type: MatchResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid data or past match date' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'Match or referenced team not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMatchDto,
  ): Promise<MatchResponseDto> {
    const match = await this.matchService.update(id, dto);
    return this.toResponseDto(match);
  }
}
