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

import { FanzoneService, FanzoneWithDistance } from './fanzone.service';
import { FanzoneEntity } from './entities/fanzone.entity';
import {
  CreateFanzoneDto,
  CrowdStatusDto,
  FanzoneFilterDto,
  FanzoneListResponseDto,
  UpdateFanzoneDto,
} from './dto';
import { TeamResponseDto } from '../match/dto/team-response.dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles } from '../../common/decorators';
import { UserRole } from '../user/entities/user.entity';

/**
 * FanzoneController — REST endpoints for fan zone management.
 *
 * Requirement: EF-08 — fan zones displayed on a map.
 * Requirement: EF-09 — distance, capacity and broadcast teams in the listing.
 * Requirement: EF-11 — anonymous crowd information.
 * Requirement: EF-12 — occupancy percentage.
 * Requirement: EF-18, EF-19 — admin fan zone CRUD.
 *
 * Reads (`GET`) are public; writes (`POST`/`PATCH`) are admin-only, gated by
 * `JwtAuthGuard` (populates `request.user`) then `RolesGuard` (`@Roles(ADMIN)`),
 * mirroring MatchController. Guards are attached per-handler rather than at the
 * class level precisely so the reads stay open — note that `@Public()` would be
 * inert here, since no guard is registered globally.
 *
 * The service returns entities; this controller projects them to
 * `FanzoneListResponseDto`, which keeps the PostGIS `location` column and the
 * check-in / recommendation / statistic relations off the wire. Clients read
 * coordinates from `latitude`/`longitude`.
 *
 * Geographic search is documented on FanzoneFilterDto: `latitude`, `longitude`
 * and `maxDistance` (kilometres) must be supplied together, and the service
 * resolves them with PostGIS against the indexed `location` geometry, returning
 * matches closest-first with a `distance` on each item.
 */
@ApiTags('FanZones')
@Controller('fanzones')
export class FanzoneController {
  constructor(private readonly fanzoneService: FanzoneService) {}

  /**
   * Projects a FanzoneEntity onto the public listing shape.
   *
   * Three coercions the entity cannot do for us, per the FanzoneResponseDto
   * contract:
   * - `latitude`/`longitude` are `numeric` columns, which `pg` returns as
   *   strings — hence `Number(...)`.
   * - `openingHour`/`closingHour` are `time` columns, which come back as
   *   `HH:mm:ss` but are documented as `HH:mm` — hence the `slice(0, 5)`.
   * - `createdAt`/`updatedAt` are Dates on the entity and ISO strings on the wire.
   *
   * `distance` is present only when the caller supplied coordinates; the service
   * attaches it to the entity in that case. `crowdStatus` is passed in because
   * it comes from a separate aggregation.
   */
  private toListResponseDto(
    fanzone: FanzoneEntity | FanzoneWithDistance,
    crowdStatus?: CrowdStatusDto,
  ): FanzoneListResponseDto {
    return {
      id: fanzone.id,
      name: fanzone.name,
      description: fanzone.description ?? null,
      latitude: Number(fanzone.latitude),
      longitude: Number(fanzone.longitude),
      capacity: fanzone.capacity,
      availableSpots: fanzone.availableSpots,
      address: fanzone.address,
      city: fanzone.city,
      openingHour: fanzone.openingHour?.slice(0, 5) ?? null,
      closingHour: fanzone.closingHour?.slice(0, 5) ?? null,
      teams: (fanzone.teams ?? []).map((team) => this.toTeamResponseDto(team)),
      createdAt: fanzone.createdAt.toISOString(),
      updatedAt: fanzone.updatedAt.toISOString(),
      distance: (fanzone as FanzoneWithDistance).distance,
      crowdStatus,
    };
  }

  /**
   * Projects a broadcast team onto the shape used inside a fan zone response.
   * Mirrors TeamController's own mapper, which is private to that class.
   */
  private toTeamResponseDto(team: {
    id: string;
    name: string;
    code: string;
    flag: string | null;
    createdAt: Date;
  }): TeamResponseDto {
    return {
      id: team.id,
      name: team.name,
      code: team.code,
      flag: team.flag ?? null,
      createdAt: team.createdAt.toISOString(),
    };
  }

  /**
   * GET /fanzones — public. Lists fan zones with optional filters (EF-08, EF-09).
   *
   * Filter fields auto-document as query parameters from FanzoneFilterDto's
   * Swagger metadata. Every result carries its crowd snapshot and occupancy
   * percentage (EF-11, EF-12), gathered in a single aggregation query for the
   * whole page rather than one per fan zone.
   */
  @Get()
  @ApiOperation({
    summary: 'List fan zones with optional filters (public)',
    description:
      'Filters: city and teamName are case-insensitive partial matches; ' +
      'minCapacity/maxCapacity bound capacity. Supplying latitude, longitude ' +
      'and maxDistance (kilometres) together restricts results to that radius ' +
      'using PostGIS and orders them closest-first, adding a distance in ' +
      'kilometres to each item. Without coordinates, results are ordered by name.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Matching fan zones, each with its crowd snapshot and occupancy percentage',
    type: [FanzoneListResponseDto],
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid filter values, or latitude/longitude/maxDistance not supplied together',
  })
  async findAll(
    @Query() filter: FanzoneFilterDto,
  ): Promise<FanzoneListResponseDto[]> {
    const fanzones = await this.fanzoneService.findAll(filter);
    const crowdByFanzone =
      await this.fanzoneService.getCrowdStatusMany(fanzones);

    return fanzones.map((fanzone) =>
      this.toListResponseDto(fanzone, crowdByFanzone.get(fanzone.id)),
    );
  }

  /**
   * GET /fanzones/:id/crowd — public and anonymous. Live crowd breakdown (EF-11).
   *
   * Declared before `GET /:id` so the more specific route is matched first.
   * The response is aggregated from check-ins with no user identifier involved.
   *
   * @throws {NotFoundException} if no fan zone has the given id.
   */
  @Get(':id/crowd')
  @ApiOperation({
    summary: 'Get the anonymous crowd breakdown for a fan zone (public)',
    description:
      'Counts supporters per team among the people currently checked in, ' +
      'plus how full the venue is. Aggregated anonymously — no user identifier ' +
      'is read or returned. "Currently present" means checked in within the ' +
      'last few hours, since a check-in has no explicit end.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the fan zone',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  })
  @ApiResponse({
    status: 200,
    description: 'Crowd snapshot for the fan zone',
    type: CrowdStatusDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed UUID' })
  @ApiResponse({ status: 404, description: 'Fan zone not found' })
  async getCrowd(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CrowdStatusDto> {
    return this.fanzoneService.getCrowdStatus(id);
  }

  /**
   * GET /fanzones/:id — public. A single fan zone with its crowd snapshot.
   *
   * Uses the bulk crowd aggregation for the one entity already in hand:
   * `getCrowdStatus` would re-query the fan zone for a 404 check this handler
   * has already performed.
   *
   * @throws {NotFoundException} if no fan zone has the given id.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single fan zone by id (public)' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the fan zone',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  })
  @ApiResponse({
    status: 200,
    description: 'The requested fan zone, with its crowd snapshot',
    type: FanzoneListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Malformed UUID' })
  @ApiResponse({ status: 404, description: 'Fan zone not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FanzoneListResponseDto> {
    const fanzone = await this.fanzoneService.findById(id);
    if (!fanzone) {
      throw new NotFoundException('Fan zone not found');
    }

    const crowdByFanzone = await this.fanzoneService.getCrowdStatusMany([
      fanzone,
    ]);

    return this.toListResponseDto(fanzone, crowdByFanzone.get(fanzone.id));
  }

  /**
   * POST /fanzones — admin only (EF-18). Creates a fan zone.
   *
   * The service validates that every supplied team exists, derives the PostGIS
   * point from the coordinates and opens the zone with all spots available. No
   * crowd snapshot is returned: a zone that has just been created has no
   * check-ins.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a fan zone (admin only)',
    description:
      'Admin-only. The PostGIS location is generated from latitude/longitude, ' +
      'and availableSpots is initialised to the full capacity.',
  })
  @ApiResponse({
    status: 201,
    description: 'Fan zone created',
    type: FanzoneListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({ status: 404, description: 'One or more teams not found' })
  async create(@Body() dto: CreateFanzoneDto): Promise<FanzoneListResponseDto> {
    const fanzone = await this.fanzoneService.create(dto);
    return this.toListResponseDto(fanzone);
  }

  /**
   * PATCH /fanzones/:id — admin only (EF-18, EF-19). Applies a partial update.
   *
   * Only the supplied fields change. The service regenerates the PostGIS point
   * when a coordinate moves and shifts `availableSpots` to match a changed
   * capacity.
   *
   * @throws {NotFoundException} if the fan zone, or a newly referenced team, is missing.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a fan zone (admin only)',
    description:
      'Admin-only. Supplying teamIds replaces the broadcast team set. ' +
      'Changing a coordinate regenerates the PostGIS location; changing ' +
      'capacity adjusts availableSpots by the same delta. An explicit ' +
      'availableSpots overrides that derived value.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the fan zone',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  })
  @ApiResponse({
    status: 200,
    description: 'Fan zone updated',
    type: FanzoneListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data, or no updatable field supplied',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  @ApiResponse({
    status: 404,
    description: 'Fan zone or referenced team not found',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFanzoneDto,
  ): Promise<FanzoneListResponseDto> {
    const fanzone = await this.fanzoneService.update(id, dto);
    return this.toListResponseDto(fanzone);
  }
}
