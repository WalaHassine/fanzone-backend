import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enables PostGIS and indexes the fan zone geometry column.
 *
 * `FanzoneEntity.location` is declared `geometry(Point, 4326)`, which the
 * `geometry` type only provides once the extension exists. Without this
 * migration, schema creation fails with `type "geometry" does not exist` — in
 * development that surfaces on the `synchronize: true` pass at boot, so the
 * extension has to be in place before the app first starts.
 *
 * The GIST index is what makes `ST_DWithin` in FanzoneService.findAll an index
 * scan rather than a sequential one. It is created conditionally: this is the
 * first migration in the repo and may well run against a database where
 * `synchronize` has not yet created the `fanzones` table.
 */
export class EnablePostgis1700000000000 implements MigrationInterface {
  name = 'EnablePostgis1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    if (await queryRunner.hasTable('fanzones')) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_fanzones_location" ON "fanzones" USING GIST ("location")`,
      );
    }
  }

  /**
   * Drops the index only. The extension is deliberately left installed:
   * `DROP EXTENSION postgis` would cascade into every spatial column in the
   * database, and reverting one migration should not destroy `fanzones.location`.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_fanzones_location"`);
  }
}
