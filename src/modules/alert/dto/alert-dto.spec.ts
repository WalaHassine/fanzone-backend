import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateAlertDto, CUSTOM_MESSAGE_MAX_LENGTH } from './create-alert.dto';

type Ctor<T> = new () => T;

/**
 * The global pipe from app.module.ts, reproduced option-for-option.
 *
 * Same reason as checkin-dto.spec.ts: `plainToInstance` copies every key it is
 * handed, so only this pipe's `whitelist` + `forbidNonWhitelisted` pair proves a
 * client cannot smuggle in a `userId`.
 */
const productionPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: false,
});

/** The messages the production pipe would put in a 400 body, or `[]` if it accepted. */
async function pipeErrors<T>(cls: Ctor<T>, payload: object): Promise<string[]> {
  try {
    await productionPipe.transform(payload, {
      type: 'body',
      metatype: cls as never,
    });
    return [];
  } catch (error) {
    const body = (error as BadRequestException).getResponse();
    const message = (body as { message?: string | string[] }).message ?? [];
    return Array.isArray(message) ? message : [message];
  }
}

/** Validation messages for a payload, with the pipe's implicit conversion applied. */
function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload, {
    enableImplicitConversion: true,
  });
  return validateSync(instance).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const MATCH_ID = '7d3f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
const USER_ID = 'a1b2c3d4-5e6f-4708-9a1b-2c3d4e5f6071';

/** The frozen clock every time-sensitive case below is written against. */
const NOW = new Date('2026-06-15T12:00:00.000Z');
const FUTURE = '2026-06-15T17:00:00.000Z';
const PAST = '2026-06-15T11:00:00.000Z';

describe('CreateAlertDto (EF-16)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts a match id and a future trigger time', () => {
    expect(
      errorsFor(CreateAlertDto, { matchId: MATCH_ID, triggerTime: FUTURE }),
    ).toEqual([]);
  });

  it('accepts an optional customMessage', () => {
    expect(
      errorsFor(CreateAlertDto, {
        matchId: MATCH_ID,
        triggerTime: FUTURE,
        customMessage: 'Meet the lads an hour early',
      }),
    ).toEqual([]);
  });

  it('rejects a missing matchId', () => {
    expect(errorsFor(CreateAlertDto, { triggerTime: FUTURE })).toContain(
      'matchId must be a valid UUID',
    );
  });

  it('rejects a matchId that is not a UUID', () => {
    expect(
      errorsFor(CreateAlertDto, { matchId: 'not-a-uuid', triggerTime: FUTURE }),
    ).toContain('matchId must be a valid UUID');
  });

  it('rejects a trigger time in the past', () => {
    expect(
      errorsFor(CreateAlertDto, { matchId: MATCH_ID, triggerTime: PAST }),
    ).toContain('triggerTime must be a datetime in the future');
  });

  it('rejects a trigger time equal to now', () => {
    expect(
      errorsFor(CreateAlertDto, {
        matchId: MATCH_ID,
        triggerTime: NOW.toISOString(),
      }),
    ).toContain('triggerTime must be a datetime in the future');
  });

  it('rejects a non-ISO trigger time', () => {
    expect(
      errorsFor(CreateAlertDto, {
        matchId: MATCH_ID,
        triggerTime: '15/06/2026 17:00',
      }),
    ).toContain('triggerTime must be an ISO 8601 datetime string');
  });

  it('reports a malformed trigger time once, not twice', () => {
    // @IsFutureDate defers to @IsISO8601 on an unparseable value precisely so a
    // single bad input does not yield two overlapping complaints.
    const errors = errorsFor(CreateAlertDto, {
      matchId: MATCH_ID,
      triggerTime: 'tomorrow',
    });

    expect(errors).toEqual(['triggerTime must be an ISO 8601 datetime string']);
  });

  it('rejects a customMessage longer than the column allows', () => {
    expect(
      errorsFor(CreateAlertDto, {
        matchId: MATCH_ID,
        triggerTime: FUTURE,
        customMessage: 'x'.repeat(CUSTOM_MESSAGE_MAX_LENGTH + 1),
      }),
    ).toContain(
      `customMessage must be at most ${CUSTOM_MESSAGE_MAX_LENGTH} characters`,
    );
  });

  it('accepts a customMessage exactly at the limit', () => {
    expect(
      errorsFor(CreateAlertDto, {
        matchId: MATCH_ID,
        triggerTime: FUTURE,
        customMessage: 'x'.repeat(CUSTOM_MESSAGE_MAX_LENGTH),
      }),
    ).toEqual([]);
  });

  it('refuses a client-supplied userId', async () => {
    // The identity comes from the JWT. A body that names a user is rejected
    // outright rather than silently stripped, so the attempt is visible.
    const errors = await pipeErrors(CreateAlertDto, {
      matchId: MATCH_ID,
      triggerTime: FUTURE,
      userId: USER_ID,
    });

    expect(errors).toContain('property userId should not exist');
  });

  it('refuses a client-supplied status', async () => {
    const errors = await pipeErrors(CreateAlertDto, {
      matchId: MATCH_ID,
      triggerTime: FUTURE,
      status: 'SENT',
    });

    expect(errors).toContain('property status should not exist');
  });
});
