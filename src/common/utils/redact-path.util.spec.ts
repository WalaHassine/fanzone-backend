import { redactPath } from './redact-path.util';

const SESSION_TOKEN = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const FANZONE_ID = 'c1d2e3f4-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('redactPath (ENF-05)', () => {
  it('replaces a session token in the path', () => {
    // The load-bearing case: this token is the credential for the public
    // GET /checkins/:sessionToken, so it must never reach a log line.
    expect(redactPath(`/checkins/${SESSION_TOKEN}`)).toBe('/checkins/:uuid');
  });

  it('replaces every UUID in a path, not just the first', () => {
    expect(
      redactPath(`/fanzones/${FANZONE_ID}/checkins/${SESSION_TOKEN}`),
    ).toBe('/fanzones/:uuid/checkins/:uuid');
  });

  it('leaves non-UUID segments alone', () => {
    expect(redactPath(`/checkins/crowd/${FANZONE_ID}`)).toBe(
      '/checkins/crowd/:uuid',
    );
  });

  it('redacts an uppercase UUID', () => {
    // @IsUUID('all') accepts either case, so a client may send either.
    expect(redactPath(`/checkins/${SESSION_TOKEN.toUpperCase()}`)).toBe(
      '/checkins/:uuid',
    );
  });

  it('redacts a UUID in a query string', () => {
    expect(redactPath(`/checkins?fanzoneId=${FANZONE_ID}`)).toBe(
      '/checkins?fanzoneId=:uuid',
    );
  });

  it('returns a URL with no UUIDs unchanged', () => {
    expect(redactPath('/checkins')).toBe('/checkins');
    expect(redactPath('/users/checkins?page=2')).toBe('/users/checkins?page=2');
  });

  it('leaves a UUID-shaped string that is not a UUID alone', () => {
    // Wrong segment lengths — redacting these would suggest a match where the
    // pattern has none.
    expect(redactPath('/checkins/not-a-uuid')).toBe('/checkins/not-a-uuid');
    expect(redactPath('/checkins/9b1deb4d-3b7d-4bad-9bdd')).toBe(
      '/checkins/9b1deb4d-3b7d-4bad-9bdd',
    );
  });
});
