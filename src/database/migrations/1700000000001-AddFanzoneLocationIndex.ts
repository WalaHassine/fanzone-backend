import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the GIST index on `fanzones.location`.
 *
 * This index is what lets the `ST_DWithin` predicate in
 * `FanzoneService.findAll` use an index scan instead of reading every row, so
 * radius search stays cheap as the table grows.
 *
 * Why this is a separate migration rather than an edit to EnablePostgis: that
 * migration wrapped the index in `if (await queryRunner.hasTable('fanzones'))`
 * so it could run before `synchronize` had created the table. It did — the table
 * did not exist yet, the branch was skipped, and the migration was still
 * recorded as executed. TypeORM never re-runs a recorded migration, so the
 * index could not be recovered by fixing that file; it needs a new one.
 *
 * No `hasTable` guard here, deliberately. That guard is exactly what turned the
 * first attempt into a silent no-op: a skipped index still counts as a
 * successful migration. Failing loudly on a missing table is the better outcome.
 * `IF NOT EXISTS` keeps it idempotent for a database where the first migration
 * did manage to create the index (a fresh `fanzone-db-test`, for instance).
 */
export class AddFanzoneLocationIndex1700000000001 implements MigrationInterface {
  name = 'AddFanzoneLocationIndex1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_fanzones_location" ON "fanzones" USING GIST ("location")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_fanzones_location"`);
  }
}
