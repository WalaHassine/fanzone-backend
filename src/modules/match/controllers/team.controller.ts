import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { TeamService } from '../services/team.service';
import { TeamEntity } from '../entities/team.entity';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { TeamResponseDto } from '../dto/team-response.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles } from '../../../common/decorators';
import { UserRole } from '../../user/entities/user.entity';

/**
 * TeamController — REST endpoints for team management.
 *
 * Requirement: EF-06 — teams back the public fixture list.
 * Requirement: EF-17 — admin team CRUD.
 *
 * Reads (`GET`) are public; writes (`POST`/`PATCH`) are admin-only, gated by
 * `JwtAuthGuard` (populates `request.user`) then `RolesGuard` (`@Roles(ADMIN)`),
 * mirroring MatchController. The service returns entities; this controller
 * projects them to `TeamResponseDto` so internal relations never leave the API.
 */
@ApiTags('Teams')
@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  /**
   * Projects a TeamEntity onto the public response shape. `flag` is normalised
   * to an explicit `null` (the column is nullable) and `createdAt` is a Date on
   * the entity but an ISO string on the wire.
   */
  private toResponseDto(team: TeamEntity): TeamResponseDto {
    return {
      id: team.id,
      name: team.name,
      code: team.code,
      flag: team.flag ?? null,
      createdAt: team.createdAt.toISOString(),
    };
  }

  /**
   * GET /teams — public. Lists every team alphabetically by name (EF-06).
   */
  @Get()
  @ApiOperation({ summary: 'List all teams (public)' })
  @ApiResponse({
    status: 200,
    description: 'Teams ordered alphabetically by name',
    type: [TeamResponseDto],
  })
  async findAll(): Promise<TeamResponseDto[]> {
    const teams = await this.teamService.findAll();
    return teams.map((team) => this.toResponseDto(team));
  }

  /**
   * GET /teams/:id — public. Returns a single team.
   *
   * @throws {NotFoundException} if no team has the given id.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single team by id (public)' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the team',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
  })
  @ApiResponse({
    status: 200,
    description: 'The requested team',
    type: TeamResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed UUID' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeamResponseDto> {
    const team = await this.teamService.findById(id);
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return this.toResponseDto(team);
  }

  /**
   * POST /teams — admin only (EF-17). Creates a team.
   *
   * The service rejects a name or code that is already taken with a
   * BadRequestException.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a team (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Team created',
    type: TeamResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, or name/code already exists',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  async create(@Body() dto: CreateTeamDto): Promise<TeamResponseDto> {
    const team = await this.teamService.create(dto);
    return this.toResponseDto(team);
  }

  /**
   * PATCH /teams/:id — admin only (EF-17). Applies a partial update.
   *
   * @throws {NotFoundException} if no team has the given id.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a team (admin only)' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the team',
    example: '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
  })
  @ApiResponse({
    status: 200,
    description: 'Team updated',
    type: TeamResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, or name/code already belongs to another team',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'Team not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamResponseDto> {
    const team = await this.teamService.update(id, dto);
    return this.toResponseDto(team);
  }
}
