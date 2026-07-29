import { ApiProperty } from '@nestjs/swagger';

import { TeamResponseDto } from '../../match/dto/team-response.dto';

/**
 * Public projection of a fan zone.
 *
 * Requirement: EF-08 — fan zones are displayed on a map.
 * Requirement: EF-09 — distance, capacity, availability and broadcast teams.
 *
 * Output DTO only: it carries no validators, since it is never bound to an
 * incoming request. Internal relations (check-ins, recommendations, statistics)
 * and the PostGIS `location` column are deliberately omitted — clients read
 * coordinates from `latitude`/`longitude`.
 *
 * Two obligations fall on whoever writes the entity → DTO mapper, because the
 * DTO contract cannot enforce them:
 * - `latitude`/`longitude` are declared `number`, but `pg` returns `numeric`
 *   columns as **strings** and FanzoneEntity has no numeric transformer. The
 *   mapper must `Number(entity.latitude)`.
 * - `openingHour`/`closingHour` are documented as `HH:mm`, but a Postgres
 *   `time` column returns `HH:mm:ss`. The mapper must normalise, e.g.
 *   `entity.openingHour?.slice(0, 5) ?? null`.
 *
 * Note on `@ApiProperty`: this project has no Swagger CLI plugin
 * (`nest-cli.json` declares `"plugins": []`), so every schema is derived from
 * the emitted `design:type`. A `string | null` union emits `Object` and would
 * render as `type: object`, and an array emits a bare `Array` with no item
 * schema — hence the explicit `type` on the nullable and array properties below.
 */
export class FanzoneResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the fan zone',
    example: 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Display name of the fan zone',
    example: 'Doha Corniche Fan Zone',
  })
  name!: string;

  @ApiProperty({
    description: 'Free-text description, or null when none has been generated',
    example: 'Open-air zone on the Corniche with a 40m screen and food trucks.',
    type: String,
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    description: 'Latitude in decimal degrees (WGS 84)',
    example: 25.2854,
  })
  latitude!: number;

  @ApiProperty({
    description: 'Longitude in decimal degrees (WGS 84)',
    example: 51.531,
  })
  longitude!: number;

  @ApiProperty({
    description: 'Maximum number of people the fan zone can host',
    example: 5000,
  })
  capacity!: number;

  @ApiProperty({
    description: 'Remaining places available right now',
    example: 3200,
  })
  availableSpots!: number;

  @ApiProperty({
    description: 'Street address of the fan zone',
    example: 'Al Corniche Street, Doha',
  })
  address!: string;

  @ApiProperty({
    description: 'City the fan zone is located in',
    example: 'Doha',
  })
  city!: string;

  @ApiProperty({
    description: 'Opening time in 24-hour HH:mm format, or null when unset',
    example: '18:00',
    type: String,
    nullable: true,
  })
  openingHour!: string | null;

  /**
   * May be earlier than `openingHour` — the pair describes a wrapping interval,
   * so a zone open past midnight reports e.g. `18:00` → `00:00`.
   */
  @ApiProperty({
    description:
      'Closing time in 24-hour HH:mm format, or null when unset; may be earlier than openingHour',
    example: '00:00',
    type: String,
    nullable: true,
  })
  closingHour!: string | null;

  @ApiProperty({
    description: 'Teams broadcast at this fan zone',
    type: () => TeamResponseDto,
    isArray: true,
  })
  teams!: TeamResponseDto[];

  @ApiProperty({
    description: 'Creation timestamp as an ISO 8601 datetime',
    example: '2026-07-27T10:15:00.000Z',
    format: 'date-time',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Last-modification timestamp as an ISO 8601 datetime',
    example: '2026-07-27T10:15:00.000Z',
    format: 'date-time',
  })
  updatedAt!: string;
}
