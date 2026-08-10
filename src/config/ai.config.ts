import { registerAs } from '@nestjs/config';

export type AiConfig = {
  groqApiKey: string;
  groqModel: string;
  groqTimeoutMs: number;
};

/**
 * Groq's current general-purpose instruct model.
 *
 * The models the original task spec named (`mixtral-8x7b-32768`,
 * `llama2-70b-4096`, `gemma-7b-it`) are all decommissioned and now answer
 * `404 model_not_found`, so the default is pinned here and overridable through
 * GROQ_MODEL when Groq rotates it again.
 */
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Per-request ceiling, in milliseconds.
 *
 * ENF-01 budgets the whole recommendation response at under 3 s; the AI call is
 * the only unbounded part of it, so it gets the entire budget and the caller
 * falls back deterministically when it is exceeded.
 */
export const DEFAULT_GROQ_TIMEOUT_MS = 3000;

/**
 * AI provider configuration namespace.
 *
 * Single owner of GROQ_API_KEY / GROQ_MODEL / GROQ_TIMEOUT — `AiService` reads
 * `ai.groqApiKey`, `ai.groqModel` and `ai.groqTimeoutMs` instead of reaching for
 * the raw environment keys.
 *
 * Requirements: EF-13, EF-14 (AI recommendation + explanation), ENF-01 (<3 s).
 */
export default registerAs('ai', (): AiConfig => {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    // Fail at boot rather than on the first recommendation request: a missing
    // key is an ops mistake, and every request would otherwise silently drop to
    // the fallback path with no obvious cause.
    throw new Error('GROQ_API_KEY is not defined in the environment');
  }

  const rawTimeout = process.env.GROQ_TIMEOUT;
  const groqTimeoutMs =
    rawTimeout === undefined ? DEFAULT_GROQ_TIMEOUT_MS : Number(rawTimeout);

  if (!Number.isFinite(groqTimeoutMs) || groqTimeoutMs <= 0) {
    throw new Error(
      `Invalid GROQ_TIMEOUT value "${rawTimeout}". Expected a positive number of milliseconds.`,
    );
  }

  return {
    groqApiKey,
    groqModel: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
    groqTimeoutMs,
  };
});
