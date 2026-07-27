import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateFanzoneDto, FANZONE_MAX_TEAMS } from './create-fanzone.dto';
import { FanzoneFilterDto } from './fanzone-filter.dto';
import { UpdateFanzoneDto } from './update-fanzone.dto';

type Ctor<T> = new () => T;

/**
 * Mirrors the global ValidationPipe in app.module.ts, which runs with
 * `transformOptions: { enableImplicitConversion: true }`.
 *
 * This deliberately differs from the helper in match-dto.spec.ts / user-dto.spec.ts,
 * which omits the option — do not "simplify" it back. Implicit conversion coerces
 * a value INTO its declared type before validation (`city: 12345` becomes the
 * string `"12345"` and passes `@IsString()`), so a spec without it asserts
 * behaviour production does not have: "rejects a non-string" tests pass here
 * while the real endpoint accepts the value.
 */
function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload, {
    enableImplicitConversion: true,
  });
  return validateSync(instance).flatMap((e) => Object.values(e.constraints ?? {}));
}

const UUID_A = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const UUID_B = '7a1e2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';
const LATITUDE = 25.2854;
const LONGITUDE = 51.531;

function validCreate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Doha Corniche Fan Zone',
    latitude: LATITUDE,
    longitude: LONGITUDE,
    capacity: 5000,
    address: 'Al Corniche Street, Doha',
    city: 'Doha',
    teamIds: [UUID_A, UUID_B],
    ...overrides,
  };
}

describe('CreateFanzoneDto (EF-08, EF-09)', () => {
  it('accepts a valid payload (description and hours are optional)', () => {
    expect(errorsFor(CreateFanzoneDto, validCreate())).toEqual([]);
  });

  it('accepts a full payload with description and hours', () => {
    expect(
      errorsFor(
        CreateFanzoneDto,
        validCreate({
          description: 'Open-air zone with a 40m screen.',
          openingHour: '09:00',
          closingHour: '23:00',
        }),
      ),
    ).toEqual([]);
  });

  describe('name / address / city', () => {
    it('rejects an empty name', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ name: '' }))).toContain(
        'Name is required',
      );
    });

    it('rejects a name longer than 255 characters', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ name: 'x'.repeat(256) })),
      ).toContain('Name must be at most 255 characters long');
    });

    it('rejects an empty address', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ address: '' }))).toContain(
        'Address is required',
      );
    });

    it('rejects an address longer than 500 characters', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ address: 'x'.repeat(501) })),
      ).toContain('Address must be at most 500 characters long');
    });

    it('rejects an empty city', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ city: '' }))).toContain(
        'City is required',
      );
    });
  });

  describe('description', () => {
    it('accepts exactly 1000 characters', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ description: 'x'.repeat(1000) })),
      ).toEqual([]);
    });

    it('rejects more than 1000 characters', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ description: 'x'.repeat(1001) })),
      ).toContain('Description must be at most 1000 characters long');
    });
  });

  describe('latitude / longitude', () => {
    it('accepts the latitude bounds', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ latitude: 90 }))).toEqual([]);
      expect(errorsFor(CreateFanzoneDto, validCreate({ latitude: -90 }))).toEqual([]);
    });

    it('rejects a latitude outside the bounds', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ latitude: 90.1 }))).toContain(
        'latitude must not be greater than 90',
      );
      expect(errorsFor(CreateFanzoneDto, validCreate({ latitude: -90.1 }))).toContain(
        'latitude must not be less than -90',
      );
    });

    it('accepts the longitude bounds', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ longitude: 180 }))).toEqual([]);
      expect(errorsFor(CreateFanzoneDto, validCreate({ longitude: -180 }))).toEqual([]);
    });

    it('rejects a longitude outside the bounds', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ longitude: 180.1 })),
      ).toContain('longitude must not be greater than 180');
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ longitude: -180.1 })),
      ).toContain('longitude must not be less than -180');
    });

    it('rejects a non-numeric latitude', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ latitude: 'not-a-number' })),
      ).toContain('latitude must be a number');
    });

    /**
     * Regression guard: `@IsNumber({ maxDecimalPlaces: 8 })` implements the check
     * as `value.toString().split('.')[1].length`, which THROWS a TypeError for
     * any value below 1e-6 — it stringifies to exponential form ('1e-7'), so
     * split('.')[1] is undefined. A valid near-equator coordinate would surface
     * as an unhandled 500. The option is intentionally absent; this test fails
     * loudly if anyone adds it back.
     */
    it('accepts a tiny near-equator coordinate without throwing', () => {
      expect(() =>
        errorsFor(
          CreateFanzoneDto,
          validCreate({ latitude: 0.0000001, longitude: -0.0000005 }),
        ),
      ).not.toThrow();
      expect(
        errorsFor(
          CreateFanzoneDto,
          validCreate({ latitude: 0.0000001, longitude: -0.0000005 }),
        ),
      ).toEqual([]);
    });
  });

  describe('capacity', () => {
    it('accepts the minimum of 10', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ capacity: 10 }))).toEqual([]);
    });

    it('rejects a capacity below 10', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ capacity: 9 }))).toContain(
        'capacity must be at least 10',
      );
    });

    it('rejects a capacity above the integer column ceiling', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ capacity: 2147483648 })),
      ).toContain('capacity must be at most 2147483647');
    });

    it('rejects a non-integer capacity', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ capacity: 100.5 }))).toContain(
        'capacity must be an integer',
      );
    });
  });

  describe('openingHour / closingHour', () => {
    it('accepts valid HH:mm times', () => {
      expect(
        errorsFor(
          CreateFanzoneDto,
          validCreate({ openingHour: '00:00', closingHour: '23:59' }),
        ),
      ).toEqual([]);
    });

    /** Overnight zones are legitimate: a late kick-off runs past midnight. */
    it('accepts a closing time earlier than the opening time', () => {
      expect(
        errorsFor(
          CreateFanzoneDto,
          validCreate({ openingHour: '18:00', closingHour: '00:00' }),
        ),
      ).toEqual([]);
      expect(
        errorsFor(
          CreateFanzoneDto,
          validCreate({ openingHour: '20:00', closingHour: '02:00' }),
        ),
      ).toEqual([]);
    });

    it('rejects a time without a colon (@IsMilitaryTime would accept this)', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ openingHour: '1800' })),
      ).toContain('openingHour must be a time in HH:mm format (00:00 to 23:59)');
    });

    it('rejects an out-of-range hour', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ closingHour: '24:00' })),
      ).toContain('closingHour must be a time in HH:mm format (00:00 to 23:59)');
    });

    it('rejects an unpadded hour', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ openingHour: '9:00' })),
      ).toContain('openingHour must be a time in HH:mm format (00:00 to 23:59)');
    });

    it('rejects out-of-range minutes', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ openingHour: '18:60' })),
      ).toContain('openingHour must be a time in HH:mm format (00:00 to 23:59)');
    });
  });

  describe('teamIds', () => {
    it('rejects an empty array', () => {
      expect(errorsFor(CreateFanzoneDto, validCreate({ teamIds: [] }))).toContain(
        'At least one team ID is required',
      );
    });

    it('rejects duplicate ids', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ teamIds: [UUID_A, UUID_A] })),
      ).toContain('teamIds must not contain duplicates');
    });

    it('rejects a malformed UUID', () => {
      expect(
        errorsFor(CreateFanzoneDto, validCreate({ teamIds: ['not-a-uuid'] })),
      ).toContain('Each team ID must be a valid UUID');
    });

    it(`rejects more than ${FANZONE_MAX_TEAMS} ids`, () => {
      const tooMany = Array.from(
        { length: FANZONE_MAX_TEAMS + 1 },
        (_, i) => `3f0c9b7e-1a2b-4c3d-9e8f-${String(i).padStart(12, '0')}`,
      );
      expect(errorsFor(CreateFanzoneDto, validCreate({ teamIds: tooMany }))).toContain(
        `teamIds must contain at most ${FANZONE_MAX_TEAMS} team IDs`,
      );
    });
  });
});

describe('UpdateFanzoneDto', () => {
  it('accepts a name-only update', () => {
    expect(errorsFor(UpdateFanzoneDto, { name: 'New name' })).toEqual([]);
  });

  it('accepts a coordinates-only update', () => {
    expect(
      errorsFor(UpdateFanzoneDto, { latitude: LATITUDE, longitude: LONGITUDE }),
    ).toEqual([]);
  });

  it('rejects an empty body — at least one field must be provided', () => {
    expect(errorsFor(UpdateFanzoneDto, {})).toContain(
      'At least one of name, description, latitude, longitude, capacity, address, city, openingHour, closingHour, teamIds must be provided',
    );
  });

  it('still enforces the capacity minimum when present', () => {
    expect(errorsFor(UpdateFanzoneDto, { capacity: 9 })).toContain(
      'capacity must be at least 10',
    );
  });

  it('still enforces the coordinate bounds when present', () => {
    expect(errorsFor(UpdateFanzoneDto, { latitude: 91 })).toContain(
      'latitude must not be greater than 90',
    );
  });

  it('still enforces the HH:mm format when present', () => {
    expect(errorsFor(UpdateFanzoneDto, { openingHour: '1800' })).toContain(
      'openingHour must be a time in HH:mm format (00:00 to 23:59)',
    );
  });

  /** A supplied array replaces the broadcast set; clearing it is not allowed. */
  it('rejects an empty teamIds array', () => {
    expect(errorsFor(UpdateFanzoneDto, { teamIds: [] })).toContain(
      'At least one team ID is required',
    );
  });
});

describe('FanzoneFilterDto (EF-08, EF-09)', () => {
  it('accepts an empty filter — every field is optional', () => {
    expect(errorsFor(FanzoneFilterDto, {})).toEqual([]);
  });

  it('accepts a city-only filter', () => {
    expect(errorsFor(FanzoneFilterDto, { city: 'Doha' })).toEqual([]);
  });

  it('accepts a capacity range', () => {
    expect(
      errorsFor(FanzoneFilterDto, { minCapacity: 1000, maxCapacity: 10000 }),
    ).toEqual([]);
  });

  it('accepts the full distance triple', () => {
    expect(
      errorsFor(FanzoneFilterDto, {
        latitude: LATITUDE,
        longitude: LONGITUDE,
        maxDistance: 5,
      }),
    ).toEqual([]);
  });

  describe('@RequiredTogether on the distance triple', () => {
    it('rejects maxDistance without coordinates', () => {
      expect(errorsFor(FanzoneFilterDto, { maxDistance: 5 })).toContain(
        'latitude, longitude and maxDistance must be provided together',
      );
    });

    it('rejects coordinates without maxDistance', () => {
      expect(
        errorsFor(FanzoneFilterDto, { latitude: LATITUDE, longitude: LONGITUDE }),
      ).toContain('latitude, longitude and maxDistance must be provided together');
    });
  });

  /**
   * Express sends '' for a bare `?latitude=`, and implicit conversion turns that
   * into 0 — which passes every coordinate bound. Without the blank-guard
   * @Transform, `?latitude=&longitude=&maxDistance=` would satisfy
   * @RequiredTogether and silently search around (0, 0).
   */
  describe('blank query parameters', () => {
    it('treats empty strings as absent rather than zero', () => {
      expect(
        errorsFor(FanzoneFilterDto, {
          latitude: '',
          longitude: '',
          maxDistance: '',
        }),
      ).toEqual([]);
    });

    it('does not let a blank triple stand in for real coordinates', () => {
      const instance = plainToInstance(
        FanzoneFilterDto,
        { latitude: '', longitude: '', maxDistance: '' },
        { enableImplicitConversion: true },
      );
      expect(instance.latitude).toBeUndefined();
      expect(instance.longitude).toBeUndefined();
      expect(instance.maxDistance).toBeUndefined();
    });

    it('still rejects a blank latitude paired with real values', () => {
      expect(
        errorsFor(FanzoneFilterDto, {
          latitude: '',
          longitude: LONGITUDE,
          maxDistance: 5,
        }),
      ).toContain('latitude, longitude and maxDistance must be provided together');
    });
  });

  it('rejects a coordinate outside the bounds', () => {
    expect(
      errorsFor(FanzoneFilterDto, {
        latitude: 91,
        longitude: LONGITUDE,
        maxDistance: 5,
      }),
    ).toContain('latitude must not be greater than 90');
  });

  it('rejects a negative maxDistance', () => {
    expect(
      errorsFor(FanzoneFilterDto, {
        latitude: LATITUDE,
        longitude: LONGITUDE,
        maxDistance: -1,
      }),
    ).toContain('maxDistance must not be negative');
  });

  it('rejects a non-integer capacity bound', () => {
    expect(errorsFor(FanzoneFilterDto, { minCapacity: 10.5 })).toContain(
      'minCapacity must be an integer',
    );
  });

  it('rejects a negative capacity bound', () => {
    expect(errorsFor(FanzoneFilterDto, { maxCapacity: -1 })).toContain(
      'maxCapacity must not be negative',
    );
  });
});
