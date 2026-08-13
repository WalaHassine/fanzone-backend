import { registerAs } from '@nestjs/config';

export type ScheduleConfig = {
  alertSweepEnabled: boolean;
  alertSweepBatchSize: number;
};

/**
 * How many due alerts one sweep will trigger.
 *
 * The cap matters after an outage: a sweep that came back to a week of overdue
 * alerts would otherwise load the whole backlog into memory in a single `find`.
 * With the cap the backlog drains at this rate per minute instead, oldest first.
 */
export const DEFAULT_ALERT_SWEEP_BATCH_SIZE = 100;

/**
 * Scheduling configuration namespace.
 *
 * Single owner of ALERT_SWEEP_ENABLED / ALERT_SWEEP_BATCH_SIZE, read once by
 * `AlertService` in its constructor rather than on every tick.
 *
 * **Why the enable flag exists.** `ScheduleModule.forRoot()` lives in
 * `AppModule`, so anything that boots the real application graph starts the
 * per-minute alert sweep — including `test/app.e2e-spec.ts`, which calls
 * `app.init()` against a real database. Defaulting to off under `NODE_ENV=test`
 * is what stops a test run from writing `SENT` rows into whatever database it
 * happens to point at. It doubles as an ops kill switch.
 *
 * Requirement: EF-16 — alert triggering.
 */
export default registerAs('schedule', (): ScheduleConfig => {
  const rawEnabled = process.env.ALERT_SWEEP_ENABLED;
  const alertSweepEnabled =
    rawEnabled === undefined
      ? process.env.NODE_ENV !== 'test'
      : rawEnabled === 'true';

  const rawBatchSize = process.env.ALERT_SWEEP_BATCH_SIZE;
  const alertSweepBatchSize =
    rawBatchSize === undefined
      ? DEFAULT_ALERT_SWEEP_BATCH_SIZE
      : Number(rawBatchSize);

  if (
    !Number.isInteger(alertSweepBatchSize) ||
    alertSweepBatchSize <= 0
  ) {
    // Fail at boot, as `ai.config.ts` does for GROQ_TIMEOUT: a zero or NaN batch
    // size would leave the sweep silently triggering nothing every minute.
    throw new Error(
      `Invalid ALERT_SWEEP_BATCH_SIZE value "${rawBatchSize}". Expected a positive integer.`,
    );
  }

  return { alertSweepEnabled, alertSweepBatchSize };
});
