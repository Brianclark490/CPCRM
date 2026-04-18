/**
 * Standalone migration runner.
 *
 * Applies every pending SQL migration in apps/api/src/db/migrations/ against
 * the database identified by DATABASE_URL (or the AZURE_POSTGRESQL_* vars),
 * then exits.  Used by the CI Kysely-types freshness check (which needs to
 * apply migrations to a throwaway Postgres without booting the full API)
 * and by anyone who wants to migrate a local DB without `npm run dev`.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import 'dotenv/config';
import { runMigrations } from './runMigrations.js';
import { pool } from './client.js';

async function main(): Promise<void> {
  await runMigrations();
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
