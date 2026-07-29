import { ApiProperty } from '@nestjs/swagger';

import { CrowdStatusDto } from '../../fanzone/dto';

/**
 * The crowd at a fan zone, as returned by the check-in module's own crowd
 * endpoint.
 *
 * Requirement: EF-11 — aggregated, anonymous presence by team.
 * Requirement: EF-12 — occupancy percentage.
 *
 * Output DTO only. Everything inherited from `CrowdStatusDto` — `totalPresent`,
 * `byTeam`, `occupancyPercentage` — keeps the meaning documented there, including
 * its anonymity guarantee: the aggregation selects a team name and a count, never
 * a user column.
 *
 * This extends rather than edits `CrowdStatusDto` because that shape is also
 * nested inside every fan zone listing, where a `fanzoneId` beside the fan zone's
 * own `id` would be redundant. The two extra fields belong to a standalone
 * response, so they live in a standalone class.
 *
 * Plain `extends` is enough — @nestjs/swagger resolves inherited `@ApiProperty`
 * metadata through the prototype chain, as `FanzoneListResponseDto` already
 * relies on.
 */
export class CrowdResponseDto extends CrowdStatusDto {
  @ApiProperty({
    description: 'UUID of the fan zone this snapshot describes',
    format: 'uuid',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  })
  fanzoneId!: string;

  @ApiProperty({
    description:
      'When this snapshot was computed (ISO 8601). Not a stored column — the ' +
      'aggregation is a live query, so the value is generated per response.',
    example: '2026-07-27T18:30:00.000Z',
  })
  updatedAt!: string;
}
