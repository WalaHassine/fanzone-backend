import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { FanzoneResponseDto } from './fanzone-response.dto';

/**
 * Per-team share of the people currently checked in at a fan zone.
 *
 * Output DTO only. `teamName` rather than a team id: this shape feeds a crowd
 * breakdown chart, so it carries the label a client renders directly.
 */
export class TeamCrowdDto {
  @ApiProperty({
    description: 'Name of the team the supporters are backing',
    example: 'France',
  })
  teamName!: string;

  @ApiProperty({
    description: 'Number of people currently checked in supporting this team',
    example: 480,
  })
  count!: number;

  @ApiProperty({
    description: 'Share of the present crowd supporting this team, 0 to 100',
    example: 60,
    minimum: 0,
    maximum: 100,
  })
  percentage!: number;
}

/**
 * Live crowd snapshot for a fan zone, aggregated from check-ins.
 *
 * Requirement: EF-12 — occupancy percentage.
 *
 * Output DTO only. "Currently present" is a service-layer definition:
 * CheckinEntity records only a `createdAt` (no check-out or expiry column), so
 * the aggregation must bound it by a time window.
 */
export class CrowdStatusDto {
  @ApiProperty({
    description: 'Total number of people currently checked in',
    example: 800,
  })
  totalPresent!: number;

  @ApiProperty({
    description: 'Breakdown of the present crowd by supported team',
    type: () => TeamCrowdDto,
    isArray: true,
  })
  byTeam!: TeamCrowdDto[];

  @ApiProperty({
    description:
      'How full the fan zone is, 0 to 100, derived from capacity and availableSpots',
    example: 36,
    minimum: 0,
    maximum: 100,
  })
  occupancyPercentage!: number;
}

/**
 * A fan zone as it appears in the list/map view: everything in
 * FanzoneResponseDto plus the two fields that only make sense in a listing
 * context, both computed rather than stored.
 *
 * Requirement: EF-09 — show distance alongside capacity and teams.
 * Requirement: EF-12 — occupancy percentage.
 *
 * Output DTO only. Both extra fields are optional because they depend on inputs
 * that may be absent: `distance` needs the caller's coordinates, and
 * `crowdStatus` needs the check-in aggregation to have been requested.
 *
 * Plain `extends` is enough — @nestjs/swagger resolves inherited `@ApiProperty`
 * metadata through the prototype chain, so no `IntersectionType` is needed.
 */
export class FanzoneListResponseDto extends FanzoneResponseDto {
  @ApiPropertyOptional({
    description:
      'Distance in kilometres from the coordinates supplied by the caller; omitted when no location was given',
    example: 2.4,
    minimum: 0,
  })
  distance?: number;

  @ApiPropertyOptional({
    description: 'Live crowd snapshot; omitted when not requested',
    type: () => CrowdStatusDto,
  })
  crowdStatus?: CrowdStatusDto;
}
