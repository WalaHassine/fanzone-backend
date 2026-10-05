import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs the `alerts` foreign keys and adds `uq_alerts_user_match`.
 *
 * `AlertEntity` declared each foreign key twice — a bare `@Column` producing
 * `"userId"`/`"matchId"` beside a `@JoinColumn({ name: 'user_id' })` producing
 * the real, constrained FK. `synchronize` therefore built four columns, and a
 * service writing the scalars would have left every relation pointing nowhere.
 * `docs/plans-status.md` records the same defect on `MatchEntity`, where it was
 * deferred because that table may hold rows; `alerts` had no writer anywhere in
 * the codebase, so it is empty in every environment and this is pure DDL.
 *
 * The unique index is the point of the migration. `AlertService.createAlert`
 * answers 409 on a duplicate and `RecommendationService.suggestAlerts` stops
 * suggesting once an alert exists, but both were guesses about the data until
 * the database agreed.
 *
 * Both are needed *here* as well as on the entity: dev runs `synchronize: true`
 * against a fresh database and never runs migrations, prod runs
 * `synchronize: false` and gets nothing from the decorator. Each covers exactly
 * one environment.
 *
 * No `hasTable` guard, deliberately — `AddFanzoneLocationIndex1700000000001`
 * explains what that guard cost the first time: a skipped statement still counts
 * as a successful migration and can never be recovered by editing the file.
 * `IF NOT EXISTS` / `IF EXISTS` keep this idempotent instead.
 *
 * The `DROP COLUMN` pair is what repairs a development database that already ran
 * `synchronize` with the split columns; it is safe only because the table is
 * empty. Check `SELECT count(*) FROM alerts` before running this anywhere shared.
 */
export class AddAlertUserMatchUniqueIndex1700000000002
  implements MigrationInterface
{
  name = 'AddAlertUserMatchUniqueIndex1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The unconstrained duplicates left behind by the old entity mapping.
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP COLUMN IF EXISTS "userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP COLUMN IF EXISTS "matchId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "custom_message" character varying(255)`,
    );

    // The real FKs were nullable only because the scalars were carrying NOT NULL.
    await queryRunner.query(
      `ALTER TABLE "alerts" ALTER COLUMN "user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" ALTER COLUMN "match_id" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_alerts_user_match" ON "alerts" ("user_id", "match_id")`,
    );
  }

  /**
   * Drops the index and the new column, and relaxes the two FKs back to
   * nullable. The `"userId"`/`"matchId"` duplicates are **not** recreated: they
   * were the defect, and restoring them would mean restoring it.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_alerts_user_match"`);
    await queryRunner.query(
      `ALTER TABLE "alerts" ALTER COLUMN "user_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" ALTER COLUMN "match_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP COLUMN IF EXISTS "custom_message"`,
    );
  }
}
