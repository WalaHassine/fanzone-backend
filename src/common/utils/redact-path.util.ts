/**
 * Matches a v1-v5 UUID anywhere in a string. Global and case-insensitive: a
 * path can carry more than one, and `@IsUUID('all')` accepts either case.
 */
const UUID_IN_PATH =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/**
 * Replaces every UUID in a request URL with `:uuid`, for logging.
 *
 * Requirement: ENF-05 — no personally identifying data leaves the system.
 *
 * **Why this exists.** `GET /checkins/:sessionToken` is public, so the token in
 * that path *is* the read credential: it alone returns the fan zone, the team
 * and the time of a check-in. Writing the raw URL to stdout writes the
 * credential down, where a log line — shipped, indexed, or read over someone's
 * shoulder — hands it to whoever sees it. Redacting at the point of logging
 * means the credential is never recorded in the first place. This also covers
 * `DELETE /checkins/:sessionToken`, which carried the same token before that
 * route was public.
 *
 * Every UUID in every path is redacted, not just check-in tokens: fan zone and
 * team ids gain nothing from being logged either, and a rule with no exceptions
 * cannot be got wrong by the next route that carries an identifier.
 *
 * Works on the URL string rather than `request.route?.path`, deliberately —
 * the route is an Express internal that is unset when no route matched, which
 * is exactly the case the exception filter handles, and a query string is
 * outside it in any case.
 *
 * @param url a request URL, with or without a query string.
 * @returns the same URL with each UUID replaced by the literal `:uuid`.
 */
export function redactPath(url: string): string {
  return url.replace(UUID_IN_PATH, ':uuid');
}
