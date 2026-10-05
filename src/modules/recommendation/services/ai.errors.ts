/**
 * Why an AI call failed, as a closed set the caller can switch on.
 *
 * - `auth`             — the API key is missing, revoked or wrong (401/403)
 * - `rate_limit`       — quota or requests-per-minute exhausted (429)
 * - `timeout`          — the provider did not answer inside GROQ_TIMEOUT
 * - `network`          — the request never reached Groq
 * - `overloaded`       — Groq answered 5xx
 * - `invalid_response` — Groq answered, but the body is unusable
 */
export type AiErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'overloaded'
  | 'invalid_response';

/**
 * The single error type `AiService` throws.
 *
 * Deliberately not an `HttpException`. `AiService` is a provider wrapper, and
 * every one of these kinds is a server-side or upstream condition — an `auth`
 * failure means *our* key is wrong, not the caller's credentials, so turning it
 * into a 401 would blame the end user for an ops problem. `RecommendationService`
 * owns the deterministic fallback and therefore owns the HTTP outcome; in the
 * normal case it never surfaces as an error at all.
 *
 * `cause` carries the original provider error for the caller's benefit but is
 * never logged raw: the Groq SDK attaches request headers (including the
 * Authorization header) to some error objects.
 */
export class AiServiceError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}
