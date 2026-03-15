import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, 'migrations');
const MIGRATION_FILENAME_RE = /^\d{3}_[a-zA-Z0-9_]+\.sql$/;

/**
 * Runs all pending SQL migrations in order.
 *
 * Tracks applied migrations in a `schema_migrations` table so re-runs are safe.
 * Migration files must match the pattern NNN_description.sql and live in
 * apps/api/src/db/migrations/.
 */
export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    // Ensure the tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Discover migration files
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => MIGRATION_FILENAME_RE.test(f))
      .sort();

    let applied = 0;

    for (const filename of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename],
      );

      if (rows.length > 0) {
        logger.debug({ filename }, 'Migration already applied, skipping');
        continue;
      }

      logger.info({ filename }, 'Applying migration');
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename],
        );
        await client.query('COMMIT');
        logger.info({ filename }, 'Migration applied');
        applied++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${filename} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    logger.info({ applied, total: files.length }, 'Database migrations complete');
  } finally {
    client.release();
  }
}
