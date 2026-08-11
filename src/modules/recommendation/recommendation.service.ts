import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';

import { RecommendationEntity } from './entities/recommendation.entity';
import { UserEntity } from '../user/entities/user.entity';
import { MatchEntity } from '../match/entities/match.entity';
import { AlertEntity } from '../alert/entities/alert.entity';
import { FanzoneEntity } from '../fanzone/entities/fanzone.entity';
import { AmbiancePreference } from '../user/entities/user-preference.entity';
import { FanzoneService } from '../fanzone/fanzone.service';
import { AiService } from './services/ai.service';
import { AiServiceError } from './services/ai.errors';
import { AiFanzoneCandidate } from './services/ai.types';
import {
  AiRecommendationOutputDto,
  AlertSuggestionDto,
  RecommendationListDto,
  RecommendationReasoningDto,
  RecommendationResponseDto,
  RecommendedFanzoneInfoDto,
  SuggestedAlertTimeDto,
} from './dto';
import {
  Coordinates,
  isKnownCity,
  resolveCityCoordinates,
} from './city-coordinates';

/**
 * How long a stored recommendation may be reused before it is regenerated.
 *
 * Not a cost optimisation so much as a consistency bound. The response rebuilds
 * `fanzoneInfo` from live fan zone rows every time, so an explanation that says
 * "plenty of room left" would eventually be printed beside an occupancy of 95%.
 * Fifteen minutes keeps the prose and the numbers within sight of each other
 * while still absorbing the repeated taps that a single user makes on one match.
 */
export const RECOMMENDATION_TTL_MINUTES = 15;

/**
 * Ceiling on how many fan zones reach the prompt.
 *
 * Every candidate is prompt text, so this bounds both token spend and latency
 * (ENF-01).
 */
export const MAX_CANDIDATES = 10;

/** Confidence attached to a recommendation the model did not make. */
export const FALLBACK_SCORE = 0.3;

/**
 * What the fan reads when the AI could not be reached.
 *
 * Deliberately says nothing about an API, a provider or an outage: the fault is
 * ours and the fan can do nothing with that information. It is also 137
 * characters, comfortably clear of the 50-character floor
 * `AiRecommendationOutputDto` enforces — the wording in the original task spec
 * was 47 characters and would have failed the project's own validator.
 */
export const FALLBACK_EXPLANATION =
  'This is the closest fan zone to you that is showing this match — we picked it by distance while a more personalised suggestion was unavailable.';

const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** How far ahead a match must be for alerts to be worth suggesting (EF-15). */
export const ALERT_SUGGESTION_WINDOW_DAYS = 7;

/**
 * The alert ladder, longest lead first.
 *
 * Offered only where the resulting instant is still in the future — see
 * `suggestAlerts`.
 */
export const ALERT_LEAD_TIMES: ReadonlyArray<{
  label: string;
  offsetSeconds: number;
}> = [
  { label: '7 days before', offsetSeconds: 7 * 24 * 60 * 60 },
  { label: '24 hours before', offsetSeconds: 24 * 60 * 60 },
  { label: '1 hour before', offsetSeconds: 60 * 60 },
  { label: '30 minutes before', offsetSeconds: 30 * 60 },
];

/**
 * Occupancy at or above which a fan zone reads as busy.
 *
 * Used only to phrase `ambianceMatch`; nothing is filtered on it.
 */
const BUSY_OCCUPANCY_THRESHOLD = 50;

/**
 * Which filters survived. `0` means every rule held; higher numbers mean the
 * candidate set was empty until a rule was dropped.
 */
type RelaxationLevel = 0 | 1 | 2 | 3;

/** Cap on {@link RecommendationService.getUserRecommendations}. */
export const USER_HISTORY_LIMIT = 20;

/**
 * What the prompt is told when a filter had to be dropped, so the explanation
 * does not claim a team match or an opening time that does not hold.
 */
const RELAXATION_NOTES: Record<Exclude<RelaxationLevel, 0>, string> = {
  1: '(Note: this zone may not broadcast either team in this match.)',
  2: '(Note: this zone may be closed at kick-off and may not broadcast either team.)',
  3: '(Note: this zone may be full, closed at kick-off, or not broadcasting either team.)',
};

/** A fan zone with the two figures the recommender reasons about. */
type Candidate = {
  fanzone: FanzoneEntity;
  distanceKm: number;
  occupancyPercentage: number;
};

/**
 * RecommendationService
 *
 * Turns a user and a match into a stored, explained fan zone recommendation.
 *
 * Requirement: EF-13 — recommend a fan zone matching the user's profile.
 * Requirement: EF-14 — provide a textual explanation.
 * Requirement: EF-15 — suggest relevant alerts.
 * Requirement: ENF-01 — produce the recommendation in under 3 seconds.
 *
 * This service owns the two things `AiService` deliberately does not: the
 * candidate set, and what happens when the model is unavailable. Every
 * `AiServiceError` is absorbed into a deterministic nearest-zone fallback, so a
 * provider outage degrades the answer rather than failing the request.
 *
 * Fan zone reads all go through `FanzoneService` rather than a repository of our
 * own, so the PostGIS distance expression and the occupancy formula each exist
 * in exactly one place and the recommendation's kilometres agree with the ones
 * `GET /fanzones` reports.
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    @InjectRepository(RecommendationEntity)
    private readonly recommendationRepository: Repository<RecommendationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(AlertEntity)
    private readonly alertRepository: Repository<AlertEntity>,
    private readonly fanzoneService: FanzoneService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Produces a recommendation for a user and a match (EF-13, EF-14).
   *
   * Reuses a stored recommendation younger than {@link RECOMMENDATION_TTL_MINUTES}
   * without calling the model at all; otherwise assembles the candidates, asks
   * Groq, and persists the result.
   *
   * @throws {NotFoundException} if the user or the match does not exist.
   * @throws {BadRequestException} if no fan zone can be recommended at all.
   */
  async generateRecommendation(
    userId: string,
    matchId: string,
  ): Promise<RecommendationResponseDto> {
    const cached = await this.findFreshRecommendation(userId, matchId);
    if (cached) {
      this.logger.log(
        `Recommendation served from cache matchId=${matchId} ageMinutes=` +
          `${Math.round((Date.now() - cached.createdAt.getTime()) / (SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND))}`,
      );
      return this.toResponseDto(cached);
    }

    // `preferences` and `favoriteTeams` are eager on UserEntity, and all three
    // relations are eager on MatchEntity, so neither read needs a `relations`
    // option.
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const location = this.resolveUserLocation(user);
    const candidates = await this.buildCandidates(location);

    if (candidates.length === 0) {
      throw new BadRequestException(
        'No fan zones are available for this match',
      );
    }

    const { selected, relaxation } = this.applyFilters(candidates, match);

    const output = await this.askAi(
      user,
      match,
      selected,
      relaxation,
      location,
    );

    // The model returns an id from the candidate set — `AiService` rejects
    // anything else — but the lookup is still guarded so a future change to
    // that contract cannot produce a recommendation pointing at nothing.
    const chosen =
      selected.find((candidate) => candidate.fanzone.id === output.fanzoneId) ??
      selected[0];

    const saved = await this.recommendationRepository.save(
      this.recommendationRepository.create({
        userId,
        matchId,
        recommendedFanZoneId: chosen.fanzone.id,
        explanation: output.explanation,
        score: output.score,
      }),
    );

    return this.buildResponse({
      id: saved.id,
      createdAt: saved.createdAt,
      matchId,
      match,
      user,
      candidate: chosen,
      explanation: output.explanation,
      score: output.score,
    });
  }

  /**
   * The user's most recent stored recommendation for a match, or `null`.
   *
   * No freshness check: this answers "what do I already have", and the caller
   * that wants a current one calls {@link generateRecommendation}.
   */
  async getRecommendation(
    userId: string,
    matchId: string,
  ): Promise<RecommendationResponseDto | null> {
    const recommendation = await this.recommendationRepository.findOne({
      where: { userId, matchId },
      order: { createdAt: 'DESC' },
    });

    return recommendation ? this.toResponseDto(recommendation) : null;
  }

  /**
   * Every recommendation made for a match, most confident first (admin).
   *
   * The ordering is done in SQL because `score` is `numeric(3,2)` and `pg`
   * returns it as a string: a JavaScript sort would compare `"0.9"` against
   * `"0.85"` as text and invert them.
   */
  async getRecommendationsForMatch(
    matchId: string,
  ): Promise<RecommendationListDto> {
    const recommendations = await this.recommendationRepository.find({
      where: { matchId },
      order: { score: 'DESC', createdAt: 'DESC' },
    });

    return { recommendations: await this.toResponseDtos(recommendations) };
  }

  /**
   * A fan's recommendation history, newest first, capped at 20.
   *
   * One row per match. The TTL means a single match re-asked over a week leaves
   * several rows behind, and without the collapse one busy fixture would fill
   * the whole history.
   */
  async getUserRecommendations(userId: string): Promise<RecommendationListDto> {
    // DISTINCT ON needs its expression to lead the ORDER BY, which is not the
    // order the caller wants — so it selects ids only, and the entities (with
    // their eager relations) are loaded in a second, unordered read.
    const rows = await this.recommendationRepository
      .createQueryBuilder('recommendation')
      .select('recommendation.id', 'id')
      .distinctOn(['recommendation.matchId'])
      .where('recommendation.userId = :userId', { userId })
      .orderBy('recommendation.matchId', 'ASC')
      .addOrderBy('recommendation.createdAt', 'DESC')
      .getRawMany<{ id: string }>();

    if (rows.length === 0) {
      return { recommendations: [] };
    }

    const recommendations = await this.recommendationRepository.find({
      where: { id: In(rows.map((row) => row.id)) },
    });

    // Safe to sort in JS: `createdAt` is a Date, not the numeric-as-string that
    // forces `score` to be ordered in SQL.
    recommendations.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );

    return {
      recommendations: await this.toResponseDtos(
        recommendations.slice(0, USER_HISTORY_LIMIT),
      ),
    };
  }

  /**
   * Proposes alert times for a match the user's team is playing (EF-15).
   *
   * @returns a single suggestion, or an empty array when none of the user's
   *   favourite teams are playing, the match is outside the
   *   {@link ALERT_SUGGESTION_WINDOW_DAYS} window, an alert already exists, or
   *   every lead time has already passed.
   * @throws {NotFoundException} if the user or the match does not exist.
   */
  async suggestAlerts(
    userId: string,
    matchId: string,
  ): Promise<AlertSuggestionDto[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const favourite = this.favouriteTeamPlaying(user, match);
    if (!favourite) {
      return [];
    }

    const now = Date.now();
    const kickOff = new Date(match.matchDate).getTime();
    const windowMs =
      ALERT_SUGGESTION_WINDOW_DAYS *
      MINUTES_PER_DAY *
      SECONDS_PER_MINUTE *
      MILLISECONDS_PER_SECOND;

    if (kickOff <= now || kickOff > now + windowMs) {
      return [];
    }

    const existing = await this.alertRepository.findOne({
      where: { userId, matchId },
    });
    if (existing) {
      return [];
    }

    // A fixed ladder offered wholesale would propose "7 days before" for a match
    // three days out — an alert that can never fire.
    const suggestedTriggerTimes: SuggestedAlertTimeDto[] = ALERT_LEAD_TIMES.map(
      (lead) => ({
        label: lead.label,
        offsetSeconds: lead.offsetSeconds,
        triggerTime: new Date(
          kickOff - lead.offsetSeconds * MILLISECONDS_PER_SECOND,
        ),
      }),
    )
      .filter((suggestion) => suggestion.triggerTime.getTime() > now)
      .map((suggestion) => ({
        ...suggestion,
        triggerTime: suggestion.triggerTime.toISOString(),
      }));

    if (suggestedTriggerTimes.length === 0) {
      return [];
    }

    return [
      {
        matchId: match.id,
        homeTeam: match.homeTeam.name,
        awayTeam: match.awayTeam.name,
        matchDate: new Date(match.matchDate).toISOString(),
        teamName: favourite,
        suggestedTriggerTimes,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Candidate assembly
  // ---------------------------------------------------------------------------

  /**
   * Where to measure distances from.
   *
   * `UserPreferenceEntity` stores a free-text city and no coordinates, so this
   * is a table lookup with a documented default. A miss is logged rather than
   * swallowed: the fix is to extend `CITY_COORDINATES` from what real users
   * actually enter.
   */
  private resolveUserLocation(user: UserEntity): Coordinates {
    const city = user.preferences?.city ?? null;

    if (!isKnownCity(city)) {
      this.logger.warn(
        `Unknown preference city "${city ?? 'none'}" — falling back to the default location`,
      );
    }

    return resolveCityCoordinates(city);
  }

  /** The nearest fan zones, each with its live occupancy. */
  private async buildCandidates(location: Coordinates): Promise<Candidate[]> {
    const nearest = await this.fanzoneService.findWithDistanceFrom(
      location.latitude,
      location.longitude,
      { limit: MAX_CANDIDATES },
    );

    if (nearest.length === 0) {
      return [];
    }

    const crowd = await this.fanzoneService.getCrowdStatusMany(nearest);

    return nearest.map((fanzone) => ({
      fanzone,
      // `findWithDistanceFrom` guarantees a distance; the fallback exists only
      // because the shared `FanzoneWithDistance` type marks it optional.
      distanceKm: fanzone.distance ?? 0,
      occupancyPercentage: crowd.get(fanzone.id)?.occupancyPercentage ?? 0,
    }));
  }

  /**
   * Narrows the candidates, relaxing a rule at a time until something survives.
   *
   * The strict reading — broadcasts a match team, open at kick-off, and has room
   * — is right when it can be satisfied and useless when it cannot: a fan whose
   * local zones are all full would get a 400 instead of the nearby zone they
   * were going to walk to anyway. So the rules are dropped in order of how much
   * the user loses by ignoring them, and the level reached is passed on to the
   * prompt so the explanation can be honest about the compromise.
   */
  private applyFilters(
    candidates: Candidate[],
    match: MatchEntity,
  ): { selected: Candidate[]; relaxation: RelaxationLevel } {
    const matchTeams = new Set(
      [match.homeTeam?.name, match.awayTeam?.name].filter(
        (name): name is string => typeof name === 'string',
      ),
    );

    const broadcastsMatch = (candidate: Candidate): boolean =>
      (candidate.fanzone.teams ?? []).some((team) => matchTeams.has(team.name));

    const hasRoom = (candidate: Candidate): boolean =>
      candidate.fanzone.availableSpots > 0;

    const isOpen = (candidate: Candidate): boolean =>
      this.isOpenAt(candidate.fanzone, match.matchDate);

    const levels: {
      level: RelaxationLevel;
      predicate: (c: Candidate) => boolean;
    }[] = [
      {
        level: 0,
        predicate: (c) => broadcastsMatch(c) && isOpen(c) && hasRoom(c),
      },
      { level: 1, predicate: (c) => isOpen(c) && hasRoom(c) },
      { level: 2, predicate: hasRoom },
      { level: 3, predicate: () => true },
    ];

    for (const { level, predicate } of levels) {
      const selected = candidates.filter(predicate);
      if (selected.length > 0) {
        if (level > 0) {
          this.logger.log(
            `Relaxed candidate filters to level ${level} (${selected.length} candidates)`,
          );
        }
        return { selected, relaxation: level };
      }
    }

    /* istanbul ignore next — level 3 accepts everything, so this is unreachable
       while `candidates` is non-empty, which the caller has already checked. */
    return { selected: candidates, relaxation: 3 };
  }

  /**
   * Whether a fan zone is open at kick-off.
   *
   * Three properties of the stored data shape this:
   * - `openingHour`/`closingHour` are **nullable**. An unset hour is missing
   *   data, not a closed venue, so it counts as open — refusing to recommend a
   *   zone because an admin left a field blank would be the wrong failure.
   * - Postgres `time` comes back as `HH:mm:ss`, so only the first five
   *   characters are parsed.
   * - The interval may **wrap past midnight** (`18:00` → `00:00`), which
   *   `RecommendedFanzoneInfoDto` documents. A naive `start <= t < end` would
   *   call such a zone closed all evening.
   *
   * Known simplification: the comparison uses UTC, while the stored hours are
   * local wall-clock and `FanzoneEntity` carries no timezone. For a deployment
   * inside one timezone this shifts the boundary by the offset; a zone open
   * 18:00–00:00 local is treated as open 18:00–00:00 UTC.
   */
  private isOpenAt(fanzone: FanzoneEntity, matchDate: Date): boolean {
    const opening = this.parseTimeToMinutes(fanzone.openingHour);
    const closing = this.parseTimeToMinutes(fanzone.closingHour);

    if (opening === null || closing === null) {
      return true;
    }

    const at = new Date(matchDate);
    const minutes = at.getUTCHours() * MINUTES_PER_HOUR + at.getUTCMinutes();

    if (opening === closing) {
      // Degenerate but real: equal hours read as "always open" rather than as a
      // zero-length window nobody could ever attend.
      return true;
    }

    return opening < closing
      ? minutes >= opening && minutes < closing
      : minutes >= opening || minutes < closing;
  }

  /** `"18:00:00"` → `1080`; `null` for absent or unparseable values. */
  private parseTimeToMinutes(value: string | null | undefined): number | null {
    if (typeof value !== 'string') {
      return null;
    }

    const match = /^(\d{2}):(\d{2})/.exec(value.trim());
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours > 23 || minutes > 59) {
      return null;
    }

    return hours * MINUTES_PER_HOUR + minutes;
  }

  // ---------------------------------------------------------------------------
  // The model, and what happens without it
  // ---------------------------------------------------------------------------

  /**
   * Asks Groq, falling back to the nearest zone on any provider failure.
   *
   * Every `AiServiceError` is absorbed here. The fan asked where to watch a
   * match; an expired API key on our side is not an answer, and the nearest
   * open zone is.
   */
  private async askAi(
    user: UserEntity,
    match: MatchEntity,
    candidates: Candidate[],
    relaxation: RelaxationLevel,
    location: Coordinates,
  ): Promise<AiRecommendationOutputDto> {
    try {
      return await this.aiService.generateRecommendation({
        userProfile: {
          email: user.email,
          favoriteTeams: (user.favoriteTeams ?? []).map((team) => team.name),
          preferredAmbiance: user.preferences?.favoriteAmbiance ?? null,
          latitude: location.latitude,
          longitude: location.longitude,
        },
        match: {
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          matchDate: new Date(match.matchDate),
          stadium: match.stadium,
        },
        candidates: candidates.map((candidate) =>
          this.toAiCandidate(candidate, relaxation),
        ),
      });
    } catch (error) {
      this.logAiFailure(error);
      return this.buildFallback(user, match, candidates);
    }
  }

  private toAiCandidate(
    candidate: Candidate,
    relaxation: RelaxationLevel,
  ): AiFanzoneCandidate {
    const { fanzone } = candidate;

    // The relaxation note rides on the description because it is the only free
    // text the AI contract carries. Without it the model is told a zone is a
    // candidate and left to assume it broadcasts the match, which at level 1 and
    // above it may not.
    const relaxationNote =
      relaxation === 0 ? null : RELAXATION_NOTES[relaxation];

    const description = [fanzone.description, relaxationNote]
      .filter((part): part is string => Boolean(part))
      .join(' ');

    return {
      id: fanzone.id,
      name: fanzone.name,
      city: fanzone.city,
      distanceKm: candidate.distanceKm,
      occupancyPercentage: candidate.occupancyPercentage,
      teamsSupported: (fanzone.teams ?? []).map((team) => team.name),
      description: description || null,
    };
  }

  /**
   * Logs a provider failure at the severity its cause deserves.
   *
   * `auth` and `overloaded` need somebody to act — a wrong key or a provider
   * outage will not resolve itself — while a timeout or a rate limit is expected
   * background noise on a free tier. Only the kind is logged; `AiService`
   * already strips the provider's error of anything sensitive.
   */
  private logAiFailure(error: unknown): void {
    const kind = error instanceof AiServiceError ? error.kind : 'unknown';
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (kind === 'auth' || kind === 'overloaded') {
      this.logger.error(
        `Falling back to nearest fan zone — AI unavailable (kind=${kind}): ${message}`,
      );
      return;
    }

    this.logger.warn(
      `Falling back to nearest fan zone — AI unavailable (kind=${kind}): ${message}`,
    );
  }

  /**
   * The deterministic recommendation: the nearest candidate.
   *
   * Returns the same type the AI path returns so both feed one mapper and the
   * fallback is held to the model's own validation rules — a fallback that could
   * not pass `AiRecommendationOutputDto` would be a bug that only appeared
   * during an outage.
   *
   * `matchesTeamPreference` is computed rather than hardcoded `false` as the
   * task spec had it: the user's teams and the zone's teams are both in hand, so
   * reporting `false` when it is true would be a plain inaccuracy.
   */
  private buildFallback(
    user: UserEntity,
    match: MatchEntity,
    candidates: Candidate[],
  ): AiRecommendationOutputDto {
    // Candidates arrive nearest-first from `findWithDistanceFrom`.
    const nearest = candidates[0];
    const reasoning = this.buildReasoning(user, nearest);

    return {
      fanzoneId: nearest.fanzone.id,
      explanation: FALLBACK_EXPLANATION,
      score: FALLBACK_SCORE,
      matchesTeamPreference: reasoning.matchesTeamPreference,
      distanceFromUser: reasoning.distanceFromUser,
      crowdLevel: reasoning.crowdLevel,
      ambianceMatch: reasoning.ambianceMatch,
    };
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  /**
   * The structured half of the justification (EF-14).
   *
   * Derived here rather than taken from the model's reply, on both the fresh and
   * the cached path. `RecommendationEntity` stores only `explanation` and
   * `score`, so a stored recommendation has no reasoning to read back — and
   * deriving it means these chips always agree with the `fanzoneInfo` printed
   * beside them, which taking the model's wording could not guarantee once the
   * occupancy had moved. The model's contribution stays what EF-14 asks for: the
   * prose.
   */
  private buildReasoning(
    user: UserEntity,
    candidate: Candidate,
  ): RecommendationReasoningDto {
    const favourites = new Set(
      (user.favoriteTeams ?? []).map((team) => team.name),
    );
    const zoneTeams = (candidate.fanzone.teams ?? []).map((team) => team.name);
    const matchesTeamPreference = zoneTeams.some((name) =>
      favourites.has(name),
    );

    return {
      matchesTeamPreference,
      distanceFromUser: `${candidate.distanceKm.toFixed(1)} km away`,
      crowdLevel: `${candidate.occupancyPercentage}% occupied`,
      ambianceMatch: this.describeAmbianceMatch(
        user.preferences?.favoriteAmbiance ?? null,
        candidate,
        matchesTeamPreference,
      ),
    };
  }

  /**
   * A short phrase for how the zone's atmosphere lines up with the preference.
   *
   * Inferred, because no fan zone stores an ambiance — the column simply does
   * not exist, and `AmbiancePreference` lives on the user side only. Crowd level
   * and whether the user's team is on the screens are the two observable proxies.
   */
  private describeAmbianceMatch(
    preference: AmbiancePreference | null,
    candidate: Candidate,
    matchesTeamPreference: boolean,
  ): string {
    const busy = candidate.occupancyPercentage >= BUSY_OCCUPANCY_THRESHOLD;

    if (preference === null) {
      return busy ? 'Lively crowd' : 'Quiet venue';
    }

    switch (preference) {
      case AmbiancePreference.CALM:
        return busy
          ? 'Busier than your calm preference'
          : 'Quiet, matching your calm preference';
      case AmbiancePreference.FAMILY:
        return busy
          ? 'Crowded for a family outing'
          : 'Room to spare for a family outing';
      case AmbiancePreference.ANIMATED:
        return busy
          ? 'Lively, matching your animated preference'
          : 'Quieter than your animated preference';
      case AmbiancePreference.SUPPORTERS:
        return busy && matchesTeamPreference
          ? 'Supporters atmosphere'
          : matchesTeamPreference
            ? 'Your team is on, but the crowd is thin'
            : 'Few fellow supporters expected';
    }
  }

  private toFanzoneInfo(candidate: Candidate): RecommendedFanzoneInfoDto {
    const { fanzone } = candidate;

    return {
      id: fanzone.id,
      name: fanzone.name,
      city: fanzone.city,
      address: fanzone.address,
      distance: Number(candidate.distanceKm.toFixed(1)),
      capacity: Number(fanzone.capacity),
      availableSpots: Number(fanzone.availableSpots),
      occupancyPercentage: candidate.occupancyPercentage,
      teamsSupported: (fanzone.teams ?? []).map((team) => team.name),
      // Postgres `time` returns HH:mm:ss; the contract is HH:mm.
      openingHour: fanzone.openingHour?.slice(0, 5) ?? null,
      closingHour: fanzone.closingHour?.slice(0, 5) ?? null,
    };
  }

  private buildResponse(input: {
    id: string;
    createdAt: Date;
    matchId: string;
    match: MatchEntity;
    user: UserEntity;
    candidate: Candidate;
    explanation: string;
    score: number;
  }): RecommendationResponseDto {
    const { candidate, match } = input;

    return {
      id: input.id,
      matchId: input.matchId,
      // The entity spells it `recommendedFanZoneId`; the public contract does
      // not inherit that inconsistency.
      recommendedFanzoneId: candidate.fanzone.id,
      recommendedFanzoneName: candidate.fanzone.name,
      recommendation: {
        fanzoneInfo: this.toFanzoneInfo(candidate),
        explanation: input.explanation,
        matchInfo: {
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          matchDate: new Date(match.matchDate).toISOString(),
          stadium: match.stadium,
        },
        reasoning: this.buildReasoning(input.user, candidate),
        // `numeric` arrives from `pg` as a string; without this the field
        // serialises as "0.87" and every client-side sort compares text.
        score: Number(input.score),
      },
      createdAt: input.createdAt.toISOString(),
    };
  }

  /** Maps one stored recommendation, recomputing the live figures. */
  private async toResponseDto(
    recommendation: RecommendationEntity,
  ): Promise<RecommendationResponseDto> {
    const [mapped] = await this.toResponseDtos([recommendation]);
    return mapped;
  }

  /**
   * Maps stored recommendations, recomputing distance and occupancy.
   *
   * Distance is measured from the **owning** user's city, not the caller's. For
   * a fan reading their own history the two are the same; for the admin listing
   * they are not, and the distance that explains a recommendation is the one the
   * fan it was made for would walk. Users are grouped by city so the number of
   * spatial queries follows the number of distinct cities, not the number of
   * rows.
   */
  private async toResponseDtos(
    recommendations: RecommendationEntity[],
  ): Promise<RecommendationResponseDto[]> {
    if (recommendations.length === 0) {
      return [];
    }

    const distances = await this.distancesByCity(recommendations);
    const crowd = await this.fanzoneService.getCrowdStatusMany(
      recommendations.map(
        (recommendation) => recommendation.recommendedFanZone,
      ),
    );

    return recommendations.map((recommendation) => {
      const fanzone = recommendation.recommendedFanZone;
      const cityKey = recommendation.user?.preferences?.city ?? null;

      const candidate: Candidate = {
        fanzone,
        distanceKm: distances.get(`${cityKey ?? ''}:${fanzone.id}`) ?? 0,
        occupancyPercentage: crowd.get(fanzone.id)?.occupancyPercentage ?? 0,
      };

      return this.buildResponse({
        id: recommendation.id,
        createdAt: recommendation.createdAt,
        matchId: recommendation.matchId,
        match: recommendation.match,
        user: recommendation.user,
        candidate,
        explanation: recommendation.explanation,
        score: Number(recommendation.score),
      });
    });
  }

  /**
   * Distance from each owning user's city to each recommended fan zone, keyed
   * `"<city>:<fanzoneId>"`.
   */
  private async distancesByCity(
    recommendations: RecommendationEntity[],
  ): Promise<Map<string, number>> {
    const fanzoneIdsByCity = new Map<string, Set<string>>();

    for (const recommendation of recommendations) {
      const city = recommendation.user?.preferences?.city ?? '';
      const ids = fanzoneIdsByCity.get(city) ?? new Set<string>();
      ids.add(recommendation.recommendedFanZoneId);
      fanzoneIdsByCity.set(city, ids);
    }

    const distances = new Map<string, number>();

    for (const [city, ids] of fanzoneIdsByCity) {
      const location = resolveCityCoordinates(city || null);
      const zones = await this.fanzoneService.findWithDistanceFrom(
        location.latitude,
        location.longitude,
        { fanzoneIds: [...ids] },
      );

      for (const zone of zones) {
        distances.set(`${city}:${zone.id}`, zone.distance ?? 0);
      }
    }

    return distances;
  }

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  /** The newest stored recommendation still inside the TTL, if any. */
  private async findFreshRecommendation(
    userId: string,
    matchId: string,
  ): Promise<RecommendationEntity | null> {
    const cutoff = new Date(
      Date.now() -
        RECOMMENDATION_TTL_MINUTES *
          SECONDS_PER_MINUTE *
          MILLISECONDS_PER_SECOND,
    );

    return this.recommendationRepository.findOne({
      where: { userId, matchId, createdAt: MoreThan(cutoff) },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * The user's favourite team playing in this match, if any.
   *
   * The home team wins when both sides are followed: the suggestion is one
   * nudge about a fixture, not one per team.
   */
  private favouriteTeamPlaying(
    user: UserEntity,
    match: MatchEntity,
  ): string | null {
    const favourites = new Set(
      (user.favoriteTeams ?? []).map((team) => team.name),
    );

    for (const name of [match.homeTeam?.name, match.awayTeam?.name]) {
      if (typeof name === 'string' && favourites.has(name)) {
        return name;
      }
    }

    return null;
  }
}
