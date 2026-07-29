import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateCheckinDto } from './create-checkin.dto';
import { CheckoutDto } from './checkout.dto';

type Ctor<T> = new () => T;

/**
 * The global pipe from app.module.ts, reproduced option-for-option.
 *
 * Needed because `plainToInstance` alone does NOT drop undeclared properties —
 * it copies every key it is given. What actually stops a client supplying a
 * `userId` is this pipe's `whitelist` + `forbidNonWhitelisted` pair, so a test
 * about undeclared fields has to run the pipe or it proves nothing.
 */
const productionPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: false,
});

/** Runs a payload through the production pipe, as an incoming request body would. */
function throughPipe<T>(cls: Ctor<T>, payload: object): Promise<unknown> {
  return productionPipe.transform(payload, {
    type: 'body',
    metatype: cls as never,
  });
}

/**
 * The messages the production pipe would put in a 400 body, or `[]` if it
 * accepted the payload.
 *
 * The thrown BadRequestException's own `message` is just "Bad Request
 * Exception" — the per-property detail lives in its response body, which is what
 * a client actually sees.
 */
async function pipeErrors<T>(cls: Ctor<T>, payload: object): Promise<string[]> {
  try {
    await throughPipe(cls, payload);
    return [];
  } catch (error) {
    const body = (error as BadRequestException).getResponse();
    const message = (body as { message?: string | string[] }).message ?? [];
    return Array.isArray(message) ? message : [message];
  }
}

/**
 * Mirrors the global ValidationPipe in app.module.ts, which runs with
 * `transformOptions: { enableImplicitConversion: true }`.
 *
 * Same helper as fanzone-dto.spec.ts, and the option is deliberate for the same
 * reason: implicit conversion coerces a value into its declared type before
 * validation, so a spec without it asserts behaviour production does not have.
 */
function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload, {
    enableImplicitConversion: true,
  });
  return validateSync(instance).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TEAM_ID = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

describe('CreateCheckinDto (EF-10)', () => {
  it('accepts a valid payload', () => {
    expect(
      errorsFor(CreateCheckinDto, { fanzoneId: FANZONE_ID, teamId: TEAM_ID }),
    ).toEqual([]);
  });

  it('accepts an upper-case UUID', () => {
    // Postgres normalises `uuid` values and compares them case-insensitively,
    // so rejecting a case variant here would refuse a legitimate id.
    expect(
      errorsFor(CreateCheckinDto, {
        fanzoneId: FANZONE_ID.toUpperCase(),
        teamId: TEAM_ID,
      }),
    ).toEqual([]);
  });

  describe('fanzoneId', () => {
    it('rejects a malformed UUID', () => {
      expect(
        errorsFor(CreateCheckinDto, {
          fanzoneId: 'not-a-uuid',
          teamId: TEAM_ID,
        }),
      ).toContain('fanzoneId must be a valid UUID');
    });

    it('rejects a missing value', () => {
      expect(errorsFor(CreateCheckinDto, { teamId: TEAM_ID })).toContain(
        'fanzoneId must be a valid UUID',
      );
    });

    it('rejects a non-string', () => {
      expect(
        errorsFor(CreateCheckinDto, { fanzoneId: 12345, teamId: TEAM_ID }),
      ).toContain('fanzoneId must be a valid UUID');
    });
  });

  describe('teamId', () => {
    it('rejects a malformed UUID', () => {
      expect(
        errorsFor(CreateCheckinDto, {
          fanzoneId: FANZONE_ID,
          teamId: 'not-a-uuid',
        }),
      ).toContain('teamId must be a valid UUID');
    });

    it('rejects a missing value', () => {
      expect(errorsFor(CreateCheckinDto, { fanzoneId: FANZONE_ID })).toContain(
        'teamId must be a valid UUID',
      );
    });
  });

  /**
   * The privacy-critical pair (ENF-05). Neither field is declared on the DTO, so
   * a caller cannot name a different user or dictate their own session token —
   * the id comes from the JWT and the token from `randomUUID()`. Asserted
   * through the production pipe, which rejects undeclared properties outright
   * rather than quietly dropping them.
   */
  describe('fields a client must not be able to supply', () => {
    it('passes a clean payload through with exactly the two declared fields', async () => {
      const result = await throughPipe(CreateCheckinDto, {
        fanzoneId: FANZONE_ID,
        teamId: TEAM_ID,
      });

      expect(Object.keys(result as object).sort()).toEqual([
        'fanzoneId',
        'teamId',
      ]);
    });

    it('rejects a body-supplied userId', async () => {
      expect(
        await pipeErrors(CreateCheckinDto, {
          fanzoneId: FANZONE_ID,
          teamId: TEAM_ID,
          userId: 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071',
        }),
      ).toContain('property userId should not exist');
    });

    it('rejects a body-supplied sessionToken', async () => {
      expect(
        await pipeErrors(CreateCheckinDto, {
          fanzoneId: FANZONE_ID,
          teamId: TEAM_ID,
          sessionToken: SESSION_TOKEN,
        }),
      ).toContain('property sessionToken should not exist');
    });
  });
});

describe('CheckoutDto (EF-10)', () => {
  it('accepts a valid payload', () => {
    expect(
      errorsFor(CheckoutDto, {
        sessionToken: SESSION_TOKEN,
        fanzoneId: FANZONE_ID,
      }),
    ).toEqual([]);
  });

  it('rejects a malformed sessionToken', () => {
    expect(
      errorsFor(CheckoutDto, {
        sessionToken: 'not-a-uuid',
        fanzoneId: FANZONE_ID,
      }),
    ).toContain('sessionToken must be a valid UUID');
  });

  it('rejects a missing sessionToken', () => {
    expect(errorsFor(CheckoutDto, { fanzoneId: FANZONE_ID })).toContain(
      'sessionToken must be a valid UUID',
    );
  });

  /** The guard field: without it the service cannot detect a zone mismatch. */
  it('rejects a missing fanzoneId', () => {
    expect(errorsFor(CheckoutDto, { sessionToken: SESSION_TOKEN })).toContain(
      'fanzoneId must be a valid UUID',
    );
  });

  it('rejects a body-supplied userId', async () => {
    // Ownership is decided by the JWT, never by the body.
    expect(
      await pipeErrors(CheckoutDto, {
        sessionToken: SESSION_TOKEN,
        fanzoneId: FANZONE_ID,
        userId: 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071',
      }),
    ).toContain('property userId should not exist');
  });
});
