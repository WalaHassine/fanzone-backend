import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, QueryFailedError, Repository } from 'typeorm';

import { AlertEntity, AlertStatus } from './entities/alert.entity';
import { UserEntity } from '../user/entities/user.entity';
import { MatchEntity } from '../match/entities/match.entity';
import type { ScheduleConfig } from '../../config/schedule.config';

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * AlertService
 *
 * Owns the alert lifecycle: a fan asks to be reminded about a fixture, the row
 * waits as PENDING, and a per-minute sweep turns it into SENT once its trigger
 * time has passed. Dismissing and deleting are the two ways it ends early.
 *
 * Requirement: EF-16 — activate an alert for a match of a favourite team.
 *
 * This is the write half of a story whose read half already shipped:
 * `RecommendationService.suggestAlerts` (EF-15) proposes trigger times, and a
 * fan posts one of them back here unchanged.
 *
 * **One alert per fan per match.** `createAlert` answers 409 on a duplicate and
 * `uq_alerts_user_match` enforces it in the database. The rule spans every
 * status, which is deliberate and has a visible consequence: a DISMISSED alert
 * still occupies the pair, and `getUserAlerts` only returns PENDING ones, so a
 * dismissed alert is invisible to the fan *and* blocks a replacement. Dismissing
 * means "stop, but keep the record"; `deleteAlert` is what frees the match for a
 * fresh alert. Narrowing the rule would also mean revisiting `suggestAlerts`,
 * which goes silent for a match as soon as any alert exists for it.
 *
 * **MVP delivery is a log line.** No email, no push. That makes the log the
 * product, which is why `triggerAlert` is careful about emitting it exactly once
 * (see its doc comment) rather than merely writing the row once.
 *
 * Repositories are injected directly rather than reaching through `UserService`
 * and `MatchService`: every use here is a single `findOne` by id, and the two
 * modules already export `TypeOrmModule`.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  /** Read once at construction so the cron body holds no config lookups. */
  private readonly sweepEnabled: boolean;
  private readonly sweepBatchSize: number;

  /**
   * Whether a sweep is running in *this process*.
   *
   * Guards against a tick arriving while the previous one is still draining a
   * backlog. It is not, and cannot be, the whole story: it says nothing about a
   * second instance. The conditional UPDATE in {@link triggerAlert} is what
   * covers that case. Two guards, two different threats — neither one makes the
   * other redundant, so please don't delete either believing it does.
   */
  private sweepInFlight = false;

  constructor(
    @InjectRepository(AlertEntity)
    private readonly alertRepository: Repository<AlertEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    private readonly configService: ConfigService,
  ) {
    // Non-null: `schedule.config.ts` throws at boot if the namespace cannot be
    // built, exactly as `ai.config.ts` does.
    const config = this.configService.get<ScheduleConfig>('schedule')!;
    this.sweepEnabled = config.alertSweepEnabled;
    this.sweepBatchSize = config.alertSweepBatchSize;
  }

  // ---------------------------------------------------------------------------
  // Fan-facing operations
  // ---------------------------------------------------------------------------

  /**
   * Schedules a reminder for a match one of the fan's favourite teams is playing
   * (EF-16).
   *
   * The checks run cheapest-and-most-specific first, so the message a caller
   * gets names the actual problem rather than whichever guard happened to be
   * written first. `now` is captured once: two `Date.now()` reads either side of
   * a millisecond boundary could produce a rejection that matches neither check.
   *
   * Both the duplicate pre-check and a `23505` catch are present. The pre-check
   * produces the good message on the normal path at the cost of one query; the
   * catch closes the window where two simultaneous requests both pass it.
   *
   * @throws {NotFoundException} if the user or the match does not exist.
   * @throws {BadRequestException} if `triggerTime` is not strictly between now
   *   and kick-off, or if neither side of the fixture is a favourite team.
   * @throws {ConflictException} if the fan already has an alert for this match,
   *   whatever its status.
   */
  async createAlert(
    userId: string,
    matchId: string,
    triggerTime: Date | string,
    customMessage?: string,
  ): Promise<AlertEntity> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const match = await this.matchRepository.findOne({ where: { id: matchId } });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // `favoriteTeams` is eager on UserEntity and `homeTeam`/`awayTeam` are eager
    // on MatchEntity, so neither read above needs a `relations` option and the
    // favourite check below costs no further query.
    const now = Date.now();
    const trigger = new Date(triggerTime).getTime();
    // Re-wrapped rather than compared directly: `>=` between a Date and a string
    // is silently wrong, and a driver or a mock may hand back either.
    const kickOff = new Date(match.matchDate).getTime();

    if (Number.isNaN(trigger)) {
      throw new BadRequestException('triggerTime must be a valid datetime');
    }

    if (trigger >= kickOff) {
      throw new BadRequestException('triggerTime must be before kick-off');
    }

    if (trigger <= now) {
      throw new BadRequestException('triggerTime must be in the future');
    }

    if (!this.favouriteTeamPlaying(user, match)) {
      throw new BadRequestException(
        'That match does not involve one of your favourite teams',
      );
    }

    const existing = await this.alertRepository.findOne({
      where: { userId, matchId },
    });
    if (existing) {
      throw new ConflictException('You already have an alert for this match');
    }

    const alert = this.alertRepository.create({
      userId,
      matchId,
      triggerTime: new Date(trigger),
      status: AlertStatus.PENDING,
      customMessage: customMessage ?? null,
    });

    try {
      return await this.alertRepository.save(alert);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        // Lost the race against a simultaneous request for the same pair.
        throw new ConflictException('You already have an alert for this match');
      }
      throw error;
    }
  }

  /**
   * The fan's active alerts, soonest first (EF-16).
   *
   * PENDING only: a SENT alert has done its job and a DISMISSED one was asked to
   * go away, so neither belongs in a list of what is still coming. Ordering is
   * part of the contract and lives in the query — chronological is the only
   * order a list of upcoming reminders reads sensibly in.
   *
   * No `relations` option: `user` and `match` are both eager on AlertEntity.
   */
  async getUserAlerts(userId: string): Promise<AlertEntity[]> {
    return this.alertRepository.find({
      where: { userId, status: AlertStatus.PENDING },
      order: { triggerTime: 'ASC' },
    });
  }

  /**
   * Marks an alert dismissed, leaving the row in place (EF-16).
   *
   * The row surviving is the point: it keeps the fan's (user, match) slot
   * occupied, so a dismissal is not quietly undone by creating the same alert
   * again. {@link deleteAlert} is the way out of that.
   *
   * @throws {NotFoundException} if no alert has that id.
   * @throws {ForbiddenException} if the alert belongs to another user.
   */
  async dismissAlert(userId: string, alertId: string): Promise<AlertEntity> {
    const alert = await this.findOwnedAlert(userId, alertId);

    alert.status = AlertStatus.DISMISSED;
    return this.alertRepository.save(alert);
  }

  /**
   * Removes an alert outright (EF-16).
   *
   * Unlike {@link dismissAlert} this frees the (user, match) pair, so the fan can
   * schedule a new reminder for the same fixture.
   *
   * @throws {NotFoundException} if no alert has that id.
   * @throws {ForbiddenException} if the alert belongs to another user.
   */
  async deleteAlert(userId: string, alertId: string): Promise<void> {
    const alert = await this.findOwnedAlert(userId, alertId);

    await this.alertRepository.delete({ id: alert.id });
  }

  // ---------------------------------------------------------------------------
  // Triggering
  // ---------------------------------------------------------------------------

  /**
   * Fires a single alert, at most once (EF-16).
   *
   * The read and the conditional update do different jobs and both are needed.
   * An `UPDATE ... WHERE status = 'PENDING'` on its own cannot honour the
   * contract, because `affected: 0` would collapse "no such alert" and "already
   * triggered" into one indistinguishable outcome; the read is what separates
   * them. But the read on its own is unsafe, because two ticks — or two
   * instances — can both see PENDING and both send. Putting the status into the
   * `where` makes Postgres the arbiter: exactly one statement matches, and the
   * loser gets `affected: 0`. Same `affected` idiom `CheckinService.checkout`
   * uses, for the same reason.
   *
   * Since the MVP's delivery *is* the log line, the log is gated on `affected`
   * rather than on the earlier read — that is what makes "sent once" true rather
   * than just "written once". `!affected` is the deliberate polarity: a missed
   * log beats a double send.
   *
   * A row deleted between the read and the update simply yields `affected: 0`
   * and is treated as a no-op, not a late 404, which is the right outcome inside
   * a sweep.
   *
   * @throws {NotFoundException} if no alert has that id.
   */
  async triggerAlert(alertId: string): Promise<void> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId },
      select: { id: true, userId: true, matchId: true, status: true },
      loadEagerRelations: false,
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.status !== AlertStatus.PENDING) {
      return;
    }

    const { affected } = await this.alertRepository.update(
      { id: alert.id, status: AlertStatus.PENDING },
      { status: AlertStatus.SENT, sentAt: new Date(Date.now()) },
    );

    if (!affected) {
      return;
    }

    this.logger.log(
      `Alert triggered userId=${alert.userId} matchId=${alert.matchId}`,
    );
  }

  /**
   * Triggers every alert that has come due (EF-16).
   *
   * Runs every minute. `ScheduleModule.forRoot()` lives in `AppModule`, so this
   * decorator is inert metadata anywhere the root module is not compiled —
   * which is what lets the specs call this method by name with no scheduler
   * running and no timers to clean up.
   *
   * Alerts are processed sequentially and each failure is logged and stepped
   * over, so one bad row cannot strand the rest of the batch. `Promise.all`
   * would blur that isolation and let the batch fan out across the connection
   * pool for no benefit — a minute is a long time.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'alert-sweep' })
  async handlePendingAlerts(): Promise<void> {
    if (!this.sweepEnabled) {
      return;
    }

    if (this.sweepInFlight) {
      // Visible rather than silent: a sweep that regularly overruns its minute
      // means the batch size or the backlog needs attention.
      this.logger.warn('Alert sweep skipped — previous run still in flight');
      return;
    }

    this.sweepInFlight = true;
    try {
      const due = await this.getPendingAlerts();
      let triggered = 0;

      for (const alert of due) {
        try {
          await this.triggerAlert(alert.id);
          triggered += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Alert ${alert.id} failed to trigger: ${message}`);
        }
      }

      if (triggered > 0) {
        this.logger.log(`Alert sweep completed, ${triggered} alerts triggered`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Alert sweep failed: ${message}`);
    } finally {
      // In `finally` so a thrown sweep cannot wedge the flag on and silence
      // every subsequent tick for the life of the process.
      this.sweepInFlight = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Alerts whose trigger time has passed and which have not yet been sent.
   *
   * `new Date(Date.now())` rather than `new Date()`: the argless constructor
   * reads the clock directly and ignores a mocked `Date.now`, which is how the
   * specs here freeze time.
   *
   * Capped at the configured batch size. Coming back from an outage to a week of
   * overdue alerts, an uncapped `find` would pull the whole backlog into memory;
   * with the cap it drains a batch a minute, oldest first.
   */
  private async getPendingAlerts(): Promise<AlertEntity[]> {
    return this.alertRepository.find({
      where: {
        status: AlertStatus.PENDING,
        triggerTime: LessThanOrEqual(new Date(Date.now())),
      },
      order: { triggerTime: 'ASC' },
      take: this.sweepBatchSize,
    });
  }

  /**
   * Loads an alert and asserts the caller owns it.
   *
   * The 404-then-403 ladder, and its ordering, follow `CheckinService`: a caller
   * learns an alert exists only when it is theirs.
   */
  private async findOwnedAlert(
    userId: string,
    alertId: string,
  ): Promise<AlertEntity> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId },
      loadEagerRelations: false,
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.userId !== userId) {
      throw new ForbiddenException('That alert belongs to another user');
    }

    return alert;
  }

  /**
   * Whether one of the user's favourite teams is playing in this match.
   *
   * A local copy of the idea in `RecommendationService.favouriteTeamPlaying` —
   * change what "favourite" means and both sites need it. It is not shared:
   * importing `RecommendationService` would drag `AiService`, the Groq client
   * and the `ai` config namespace into this module's injector for six lines of
   * set membership. The two also answer different questions — that one returns a
   * team *name* because it writes prose about it, this one only gates.
   *
   * Compared on team **id**, and taken from the eager relations. `TeamEntity.name`
   * carries no unique constraint, so a name comparison is a latent false
   * positive.
   */
  private favouriteTeamPlaying(user: UserEntity, match: MatchEntity): boolean {
    const favourites = new Set(
      (user.favoriteTeams ?? []).map((team) => team.id),
    );

    return [match.homeTeam?.id, match.awayTeam?.id].some(
      (id) => typeof id === 'string' && favourites.has(id),
    );
  }

  /**
   * Whether an error is Postgres' unique_violation.
   *
   * Both shapes are checked because TypeORM wraps driver errors and which one
   * surfaces depends on the call path.
   */
  private isUniqueViolation(error: unknown): boolean {
    if (error instanceof QueryFailedError) {
      const driverError = (error as QueryFailedError & { driverError?: unknown })
        .driverError;
      if ((driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION) {
        return true;
      }
    }

    return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;
  }
}
