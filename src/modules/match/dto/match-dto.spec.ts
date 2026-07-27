import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateMatchDto } from './create-match.dto';
import { MatchFilterDto } from './match-filter.dto';
import { UpdateMatchDto } from './update-match.dto';
import { MatchStatus } from '../entities/match.entity';

type Ctor<T> = new () => T;

function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance).flatMap((e) => Object.values(e.constraints ?? {}));
}

const UUID_A = '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';
const UUID_B = '7a1e2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';
const FUTURE = '2099-11-21T16:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';
const STADIUM = 'Lusail Stadium';

function validCreate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    homeTeamId: UUID_A,
    awayTeamId: UUID_B,
    matchDate: FUTURE,
    stadium: STADIUM,
    ...overrides,
  };
}

describe('CreateMatchDto', () => {
  it('accepts a valid payload (status defaults, so it is optional)', () => {
    expect(errorsFor(CreateMatchDto, validCreate())).toEqual([]);
  });

  it('accepts an explicit valid status', () => {
    expect(
      errorsFor(CreateMatchDto, validCreate({ status: MatchStatus.LIVE })),
    ).toEqual([]);
  });

  it('rejects a non-UUID home team id', () => {
    expect(
      errorsFor(CreateMatchDto, validCreate({ homeTeamId: 'not-a-uuid' })),
    ).toContain('homeTeamId must be a valid UUID');
  });

  it('rejects a non-UUID away team id', () => {
    expect(
      errorsFor(CreateMatchDto, validCreate({ awayTeamId: 'not-a-uuid' })),
    ).toContain('awayTeamId must be a valid UUID');
  });

  it('rejects a malformed match date', () => {
    expect(
      errorsFor(CreateMatchDto, validCreate({ matchDate: 'not-a-date' })),
    ).toContain('matchDate must be a valid ISO 8601 datetime');
  });

  it('rejects a match date in the past', () => {
    expect(
      errorsFor(CreateMatchDto, validCreate({ matchDate: PAST })),
    ).toContain('matchDate must be a datetime in the future');
  });

  it('rejects an empty stadium', () => {
    expect(errorsFor(CreateMatchDto, validCreate({ stadium: '' }))).toContain(
      'Stadium is required',
    );
  });

  it('rejects a stadium longer than 255 characters', () => {
    expect(
      errorsFor(CreateMatchDto, validCreate({ stadium: 'x'.repeat(256) })),
    ).toContain('Stadium must be at most 255 characters long');
  });

  it('rejects a status outside the enum', () => {
    expect(
      errorsFor(CreateMatchDto, validCreate({ status: 'FINISHED' })),
    ).toContain('Status must be one of: SCHEDULED, LIVE, COMPLETED, CANCELLED');
  });
});

describe('MatchFilterDto (EF-06, EF-07)', () => {
  it('accepts an empty filter — every field is optional', () => {
    expect(errorsFor(MatchFilterDto, {})).toEqual([]);
  });

  it('accepts a team-name-only filter (EF-07)', () => {
    expect(errorsFor(MatchFilterDto, { teamName: 'France' })).toEqual([]);
  });

  it('accepts a full date range and status', () => {
    expect(
      errorsFor(MatchFilterDto, {
        startDate: FUTURE,
        endDate: FUTURE,
        status: MatchStatus.COMPLETED,
      }),
    ).toEqual([]);
  });

  it('rejects a malformed startDate', () => {
    expect(errorsFor(MatchFilterDto, { startDate: 'nope' })).toContain(
      'startDate must be a valid ISO 8601 datetime',
    );
  });

  it('allows a past date in the filter (unlike create)', () => {
    expect(errorsFor(MatchFilterDto, { startDate: PAST })).toEqual([]);
  });
});

describe('UpdateMatchDto', () => {
  it('accepts a stadium-only update', () => {
    expect(errorsFor(UpdateMatchDto, { stadium: STADIUM })).toEqual([]);
  });

  it('accepts a status-only update', () => {
    expect(errorsFor(UpdateMatchDto, { status: MatchStatus.LIVE })).toEqual([]);
  });

  it('rejects an empty body — at least one field must be provided', () => {
    expect(errorsFor(UpdateMatchDto, {})).toContain(
      'At least one of homeTeamId, awayTeamId, matchDate, stadium, status must be provided',
    );
  });

  it('still enforces the future-date rule when matchDate is present', () => {
    expect(errorsFor(UpdateMatchDto, { matchDate: PAST })).toContain(
      'matchDate must be a datetime in the future',
    );
  });

  it('still rejects an invalid team id when present', () => {
    expect(errorsFor(UpdateMatchDto, { homeTeamId: 'not-a-uuid' })).toContain(
      'homeTeamId must be a valid UUID',
    );
  });
});
