import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { RequiredTogether } from '../../../common/validators/required-together.validator';
import { FANZONE_CAPACITY_MAX } from './create-fanzone.dto';

/**
 * Blank query parameters must read as "absent", not as zero.
 *
 * Express sends `""` for a bare `?latitude=`, and the global ValidationPipe runs
 * with `enableImplicitConversion: true`, which turns `""` and `"  "` into `0` —
 * a value that passes `@IsNumber()` and every coordinate bound. Without this
 * guard, `?latitude=&longitude=&maxDistance=` would satisfy `@RequiredTogether`
 * and silently run a geographic search around (0, 0).
 *
 * It inspects `obj[key]` (the ORIGINAL plain payload) rather than `value`:
 * class-transformer applies implicit conversion *before* custom `@Transform`
 * callbacks, so by the time this runs `value` is already the number `0` and the
 * blank string is unrecoverable from it.
 */
const blankToUndefined = ({
  value,
  obj,
  key,
}: {
  value: unknown;
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj?.[key];
  return typeof raw === 'string' && raw.trim() === '' ? undefined : value;
};

/**
 * Query filters for the fan zone list (EF-08, EF-09).
 *
 * Every field is optional; with no filter, every fan zone is returned.
 *
 * The capacity and distance parameters are **flat**, not the nested
 * `capacity[min]` / `distance[latitude]` objects one might expect. This project
 * runs Express 5, whose default `simple` query parser does not interpret bracket
 * notation: `?capacity[min]=100` arrives as the literal key `"capacity[min]"`,
 * which `forbidNonWhitelisted: true` then rejects with a 400. Nesting would
 * require switching the parser globally in `main.ts` and would change how every
 * existing endpoint reads its query string.
 *
 * Matching semantics (`city`, `teamName` are case-insensitive partial matches)
 * are applied by the service layer, as MatchService.findAll already does with
 * `ILIKE`.
 */
@RequiredTogether(['latitude', 'longitude', 'maxDistance'], {
  message: 'latitude, longitude and maxDistance must be provided together',
})
export class FanzoneFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by city (case-insensitive partial match)',
    example: 'Doha',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description:
      'Filter to fan zones broadcasting this team (case-insensitive partial match on the team name)',
    example: 'France',
  })
  @IsOptional()
  @IsString()
  teamName?: string;

  @ApiPropertyOptional({
    description: 'Only fan zones with at least this capacity',
    example: 1000,
    minimum: 0,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsInt({ message: 'minCapacity must be an integer' })
  @Min(0, { message: 'minCapacity must not be negative' })
  @Max(FANZONE_CAPACITY_MAX, {
    message: `minCapacity must be at most ${FANZONE_CAPACITY_MAX}`,
  })
  minCapacity?: number;

  @ApiPropertyOptional({
    description: 'Only fan zones with at most this capacity',
    example: 10000,
    minimum: 0,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsInt({ message: 'maxCapacity must be an integer' })
  @Min(0, { message: 'maxCapacity must not be negative' })
  @Max(FANZONE_CAPACITY_MAX, {
    message: `maxCapacity must be at most ${FANZONE_CAPACITY_MAX}`,
  })
  maxCapacity?: number;

  @ApiPropertyOptional({
    description:
      'Latitude of the caller, in decimal degrees; required together with longitude and maxDistance',
    example: 25.2854,
    minimum: -90,
    maximum: 90,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsNumber({}, { message: 'latitude must be a number' })
  @Min(-90, { message: 'latitude must not be less than -90' })
  @Max(90, { message: 'latitude must not be greater than 90' })
  latitude?: number;

  @ApiPropertyOptional({
    description:
      'Longitude of the caller, in decimal degrees; required together with latitude and maxDistance',
    example: 51.531,
    minimum: -180,
    maximum: 180,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsNumber({}, { message: 'longitude must be a number' })
  @Min(-180, { message: 'longitude must not be less than -180' })
  @Max(180, { message: 'longitude must not be greater than 180' })
  longitude?: number;

  /**
   * Kilometres — stated explicitly because the obvious PostGIS implementation
   * (`ST_DWithin` on a `geography`) takes **metres**, so the service must
   * convert rather than pass this through.
   */
  @ApiPropertyOptional({
    description:
      'Search radius in KILOMETRES around the supplied coordinates; required together with latitude and longitude',
    example: 5,
    minimum: 0,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsNumber({}, { message: 'maxDistance must be a number' })
  @Min(0, { message: 'maxDistance must not be negative' })
  maxDistance?: number;
}
