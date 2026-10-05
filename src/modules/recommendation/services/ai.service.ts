import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import Groq, { APIConnectionError, APIConnectionTimeoutError } from 'groq-sdk';

import { AiConfig } from '../../../config/ai.config';
import { AiRecommendationOutputDto } from '../dto/ai-recommendation-output.dto';
import { AiServiceError } from './ai.errors';
import {
  GenerateDescriptionParams,
  GenerateRecommendationParams,
} from './ai.types';

/** Low temperature: this is a ranking task, not a creative one. */
const RECOMMENDATION_TEMPERATURE = 0.3;
const RECOMMENDATION_MAX_TOKENS = 500;
const DESCRIPTION_TEMPERATURE = 0.7;
const DESCRIPTION_MAX_TOKENS = 150;

/**
 * AiService
 *
 * Thin, stateless wrapper around the Groq chat-completions API. It turns a user
 * profile + match + candidate fan zones into a *validated*
 * `AiRecommendationOutputDto`, and it does nothing else: no database access, no
 * caching, and — deliberately — no fallback.
 *
 * The deterministic fallback lives in `RecommendationService`, which already
 * holds the candidate list and each zone's distance and can therefore pick the
 * closest matching zone without a second query. Everything that can go wrong
 * here surfaces as a typed `AiServiceError`, leaving both the retry policy and
 * the HTTP outcome with the caller.
 *
 * Requirements: EF-13 (personalised recommendation), EF-14 (textual
 * explanation), EF-21 (auto-generated fan zone description), ENF-01 (<3 s).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Groq;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    // Non-null: `ai.config.ts` throws at boot if the namespace cannot be built,
    // so by the time Nest instantiates this provider the config exists.
    const config = this.configService.get<AiConfig>('ai')!;

    this.model = config.groqModel;
    this.client = new Groq({
      apiKey: config.groqApiKey,
      timeout: config.groqTimeoutMs,
      // Load-bearing. The SDK retries twice by default, which would let a slow
      // provider consume three times the timeout and blow the ENF-01 budget
      // with the caller none the wiser. Retrying is the fallback's decision.
      maxRetries: 0,
    });
  }

  /**
   * Asks the model to pick the best fan zone out of `candidates` and justify it.
   *
   * @throws AiServiceError — `invalid_response` when the candidate set is empty,
   *         the reply will not parse, fails DTO validation, or names a fan zone
   *         that was never offered; otherwise the mapped provider failure.
   */
  async generateRecommendation(
    params: GenerateRecommendationParams,
  ): Promise<AiRecommendationOutputDto> {
    const { candidates } = params;

    if (candidates.length === 0) {
      // Prompting with an empty list can only produce a hallucinated id, so it
      // is cheaper and safer to refuse before spending the round trip.
      throw new AiServiceError(
        'invalid_response',
        'Cannot generate a recommendation from an empty candidate list',
      );
    }

    const prompt = this.buildRecommendationPrompt(params);
    const startedAt = Date.now();

    const completion = await this.client.chat.completions
      .create({
        model: this.model,
        temperature: RECOMMENDATION_TEMPERATURE,
        max_tokens: RECOMMENDATION_MAX_TOKENS,
        // Groq's JSON mode. Removes most markdown-fence failures at the source;
        // `parseGroqResponse` still strips fences as defence in depth.
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a FIFA World Cup fan zone assistant. You reply with a single JSON object and nothing else.',
          },
          { role: 'user', content: prompt },
        ],
      })
      .catch((error: unknown) => {
        throw this.mapGroqError(error);
      });

    const choice = completion.choices?.[0];

    this.logger.log(
      // Never the key, the prompt or the user's email — this line ends up in
      // aggregated logs.
      `Groq recommendation model=${this.model} elapsedMs=${Date.now() - startedAt} ` +
        `candidates=${candidates.length} finishReason=${choice?.finish_reason ?? 'none'}`,
    );

    const parsed = this.parseGroqResponse(choice?.message?.content ?? null);
    if (parsed === null) {
      throw new AiServiceError(
        'invalid_response',
        'Groq returned a reply that is not parseable JSON',
      );
    }

    return this.validateResponse(
      parsed,
      new Set(candidates.map((candidate) => candidate.id)),
    );
  }

  /**
   * Writes a short marketing description for a fan zone (EF-21).
   *
   * Returns the text; persisting it to `FanzoneEntity.description` is the
   * caller's job, so this method stays free of database concerns.
   *
   * @throws AiServiceError — `invalid_response` on an empty reply.
   */
  async generateFanzoneDescription(
    fanzone: GenerateDescriptionParams,
  ): Promise<string> {
    const teams = fanzone.teamsSupported.length
      ? fanzone.teamsSupported.join(', ')
      : 'no specific team';

    const completion = await this.client.chat.completions
      .create({
        model: this.model,
        temperature: DESCRIPTION_TEMPERATURE,
        max_tokens: DESCRIPTION_MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content:
              'You write short, factual descriptions of World Cup fan zones. Reply with prose only, no preamble.',
          },
          {
            role: 'user',
            content:
              `Write 1 to 3 sentences describing this fan zone for supporters deciding where to watch a match.\n` +
              `Name: ${fanzone.name}\nCity: ${fanzone.city}\n` +
              `Capacity: ${fanzone.capacity} people\nSupports: ${teams}\n` +
              `Mention the city, the capacity and the atmosphere. Do not invent facilities or prices.`,
          },
        ],
      })
      .catch((error: unknown) => {
        throw this.mapGroqError(error);
      });

    const description = completion.choices?.[0]?.message?.content?.trim() ?? '';
    if (!description) {
      throw new AiServiceError(
        'invalid_response',
        'Groq returned an empty fan zone description',
      );
    }

    return description;
  }

  /**
   * Renders the prompt.
   *
   * Two instructions here exist because of the data model rather than the
   * prompt-engineering: every candidate line carries its UUID and the model is
   * told to echo one of exactly those ids, and `ambianceMatch` is spelled out as
   * an *inference* — `FanzoneEntity` has no ambiance column, so left implicit
   * the model invents a zone attribute that does not exist.
   *
   * The explanation length is stated explicitly because a two-word explanation
   * is by far the most common validation failure, and a sentence in the prompt
   * is cheaper than a rejected round trip.
   */
  private buildRecommendationPrompt(
    params: GenerateRecommendationParams,
  ): string {
    const { userProfile, match, candidates } = params;

    const favoriteTeams = userProfile.favoriteTeams.length
      ? userProfile.favoriteTeams.join(', ')
      : 'none stated';

    const candidateLines = candidates
      .map((candidate, index) => {
        const teams = candidate.teamsSupported.length
          ? candidate.teamsSupported.join(', ')
          : 'no specific team';

        return (
          `${index + 1}. id=${candidate.id}\n` +
          `   name: ${candidate.name} (${candidate.city})\n` +
          `   distance: ${candidate.distanceKm.toFixed(1)} km from the user\n` +
          `   occupancy: ${candidate.occupancyPercentage}% full\n` +
          `   supports: ${teams}\n` +
          `   description: ${candidate.description ?? 'none'}`
        );
      })
      .join('\n');

    return (
      `Pick the single best fan zone for this supporter.\n\n` +
      `MATCH\n` +
      `${match.homeTeam} vs ${match.awayTeam} at ${match.stadium}, ` +
      `${match.matchDate.toISOString()}\n\n` +
      `SUPPORTER\n` +
      `Favourite teams: ${favoriteTeams}\n` +
      `Preferred ambiance: ${userProfile.preferredAmbiance ?? 'none stated'}\n\n` +
      `CANDIDATE FAN ZONES\n${candidateLines}\n\n` +
      `RULES\n` +
      `- Weigh distance, occupancy and whether the zone supports a favourite team.\n` +
      `- No fan zone stores an ambiance. Infer "ambianceMatch" yourself from the ` +
      `occupancy, the supported teams and the description, and say how it lines up ` +
      `with the preferred ambiance.\n` +
      `- "fanzoneId" MUST be one of the ids listed above, copied exactly. Never invent one.\n\n` +
      `Reply with a JSON object and nothing else:\n` +
      `{\n` +
      `  "fanzoneId": "<one of the ids above>",\n` +
      `  "explanation": "<between 50 and 500 characters, addressed to the supporter>",\n` +
      `  "score": <confidence between 0 and 1, e.g. 0.87 — never a percentage>,\n` +
      `  "matchesTeamPreference": <true or false>,\n` +
      `  "distanceFromUser": "<short phrase, e.g. \\"3.2 km away\\">",\n` +
      `  "crowdLevel": "<short phrase, e.g. \\"moderately busy at 60%\\">",\n` +
      `  "ambianceMatch": "<short phrase describing the inferred atmosphere fit>"\n` +
      `}`
    );
  }

  /**
   * Best-effort JSON extraction from a chat reply.
   *
   * Never throws — a null return means "unusable", and the caller decides what
   * that costs. Handles a bare object, a fenced block, and prose wrapped around
   * an object, which is what models produce when JSON mode is unavailable or
   * ignored.
   */
  private parseGroqResponse(text: string | null): unknown {
    if (!text) {
      return null;
    }

    let candidate = text.trim();

    const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(candidate);
    if (fenced) {
      candidate = fenced[1].trim();
    }

    if (!candidate.startsWith('{')) {
      const first = candidate.indexOf('{');
      const last = candidate.lastIndexOf('}');
      if (first === -1 || last <= first) {
        return null;
      }
      candidate = candidate.slice(first, last + 1);
    }

    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }

  /**
   * Validates the parsed reply against `AiRecommendationOutputDto`.
   *
   * `enableImplicitConversion` is deliberately absent, per the DTO's docblock:
   * with it on, `"0.9"` would become a number and `"yes"` a boolean before the
   * validators ran, quietly repairing a reply that is in the wrong shape.
   *
   * The `candidateIds` check is separate from validation because `@IsUUID` only
   * proves the id is well-formed, not that it is one we offered.
   */
  private validateResponse(
    parsed: unknown,
    candidateIds: Set<string>,
  ): AiRecommendationOutputDto {
    const dto = plainToInstance(AiRecommendationOutputDto, parsed);

    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const messages = errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join('; ');

      throw new AiServiceError(
        'invalid_response',
        `Groq reply failed validation: ${messages}`,
      );
    }

    if (!candidateIds.has(dto.fanzoneId)) {
      throw new AiServiceError(
        'invalid_response',
        `Groq returned fanzoneId "${dto.fanzoneId}", which was not among the candidates`,
      );
    }

    return dto;
  }

  /**
   * Narrows a provider failure to an `AiErrorKind`.
   *
   * Only `status` and `code` are logged — the SDK hangs the full request context
   * (headers included) off some errors, and that context carries the API key.
   */
  private mapGroqError(error: unknown): AiServiceError {
    const status = (error as { status?: number } | null)?.status;
    const code = (error as { code?: string } | null)?.code;

    const logged = `status=${status ?? 'none'} code=${code ?? 'none'}`;

    if (error instanceof APIConnectionTimeoutError || code === 'ETIMEDOUT') {
      this.logger.warn(`Groq request timed out (${logged})`);
      return new AiServiceError('timeout', 'Groq request timed out', error);
    }

    if (status === 401 || status === 403) {
      // `error`, not `warn`: nothing the user did caused this and nobody but us
      // can fix it.
      this.logger.error(`Groq rejected the API key (${logged})`);
      return new AiServiceError(
        'auth',
        'Groq rejected the configured API key',
        error,
      );
    }

    if (status === 429) {
      this.logger.warn(`Groq rate limit reached (${logged})`);
      return new AiServiceError('rate_limit', 'Groq rate limit reached', error);
    }

    if (typeof status === 'number' && status >= 500) {
      this.logger.warn(`Groq is unavailable (${logged})`);
      return new AiServiceError('overloaded', 'Groq is unavailable', error);
    }

    if (error instanceof APIConnectionError) {
      this.logger.warn(`Groq is unreachable (${logged})`);
      return new AiServiceError('network', 'Groq is unreachable', error);
    }

    this.logger.warn(`Groq request failed (${logged})`);
    return new AiServiceError('network', 'Groq request failed', error);
  }
}
