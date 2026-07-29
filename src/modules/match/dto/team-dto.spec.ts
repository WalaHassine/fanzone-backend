import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateTeamDto } from './create-team.dto';
import { UpdateTeamDto } from './update-team.dto';

type Ctor<T> = new () => T;

function errorsFor<T extends object>(cls: Ctor<T>, payload: object): string[] {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const FLAG = 'https://cdn.example.com/flags/fra.png';

function validCreate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'France',
    code: 'FRA',
    ...overrides,
  };
}

describe('CreateTeamDto', () => {
  it('accepts a valid payload (flag is optional)', () => {
    expect(errorsFor(CreateTeamDto, validCreate())).toEqual([]);
  });

  it('accepts a valid payload with a flag URL', () => {
    expect(errorsFor(CreateTeamDto, validCreate({ flag: FLAG }))).toEqual([]);
  });

  it('accepts a name with an accent and an apostrophe', () => {
    expect(
      errorsFor(CreateTeamDto, validCreate({ name: "Côte d'Ivoire" })),
    ).toEqual([]);
  });

  it('accepts a hyphenated name', () => {
    expect(
      errorsFor(CreateTeamDto, validCreate({ name: 'Bosnia-Herzegovina' })),
    ).toEqual([]);
  });

  it('rejects a name containing a digit', () => {
    expect(
      errorsFor(CreateTeamDto, validCreate({ name: 'France2' })),
    ).toContain(
      'Name may only contain letters, spaces, hyphens, apostrophes and periods',
    );
  });

  it('rejects a name containing a symbol', () => {
    expect(
      errorsFor(CreateTeamDto, validCreate({ name: 'Fra@nce' })),
    ).toContain(
      'Name may only contain letters, spaces, hyphens, apostrophes and periods',
    );
  });

  it('rejects an empty name', () => {
    expect(errorsFor(CreateTeamDto, validCreate({ name: '' }))).toContain(
      'Name is required',
    );
  });

  it('rejects a name longer than 255 characters', () => {
    expect(
      errorsFor(CreateTeamDto, validCreate({ name: 'x'.repeat(256) })),
    ).toContain('Name must be at most 255 characters long');
  });

  it('uppercases a lowercase code and accepts it', () => {
    const instance = plainToInstance(
      CreateTeamDto,
      validCreate({ code: 'fra' }),
    );
    expect(validateSync(instance)).toEqual([]);
    expect(instance.code).toBe('FRA');
  });

  it('rejects a code that is not exactly 3 characters', () => {
    expect(errorsFor(CreateTeamDto, validCreate({ code: 'FRAN' }))).toContain(
      'Code must be exactly 3 alphanumeric characters',
    );
    expect(errorsFor(CreateTeamDto, validCreate({ code: 'FR' }))).toContain(
      'Code must be exactly 3 alphanumeric characters',
    );
  });

  it('rejects a code containing a symbol', () => {
    expect(errorsFor(CreateTeamDto, validCreate({ code: 'F-A' }))).toContain(
      'Code must be exactly 3 alphanumeric characters',
    );
  });

  it('rejects a flag that is not a URL', () => {
    expect(
      errorsFor(CreateTeamDto, validCreate({ flag: 'not-a-url' })),
    ).toContain('Flag must be a valid http(s) URL');
  });

  it('rejects a flag URL without an http(s) protocol', () => {
    expect(
      errorsFor(
        CreateTeamDto,
        validCreate({ flag: 'ftp://example.com/f.png' }),
      ),
    ).toContain('Flag must be a valid http(s) URL');
  });
});

describe('UpdateTeamDto', () => {
  it('accepts a flag-only update', () => {
    expect(errorsFor(UpdateTeamDto, { flag: FLAG })).toEqual([]);
  });

  it('accepts a name-only update', () => {
    expect(errorsFor(UpdateTeamDto, { name: 'France' })).toEqual([]);
  });

  it('rejects an empty body — at least one field must be provided', () => {
    expect(errorsFor(UpdateTeamDto, {})).toContain(
      'At least one of name, code, flag must be provided',
    );
  });

  it('still uppercases and validates the code when present', () => {
    const instance = plainToInstance(UpdateTeamDto, { code: 'tun' });
    expect(validateSync(instance)).toEqual([]);
    expect(instance.code).toBe('TUN');
  });

  it('still enforces the name pattern when present', () => {
    expect(errorsFor(UpdateTeamDto, { name: 'France2' })).toContain(
      'Name may only contain letters, spaces, hyphens, apostrophes and periods',
    );
  });

  it('still rejects an invalid flag URL when present', () => {
    expect(errorsFor(UpdateTeamDto, { flag: 'not-a-url' })).toContain(
      'Flag must be a valid http(s) URL',
    );
  });
});
