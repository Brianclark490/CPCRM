import { Kysely, PostgresDialect } from 'kysely';
import { pool } from './client.js';
import type { DB } from './kysely.types.js';

/**
 * RLS-aware Kysely instance for `@cpcrm/api`.
 *
 * This wraps the same `Pool` proxy exported from `./client.ts`, so Kysely
 * queries automatically pick up the tenant context set by the
 * `requireTenant` middleware via {@link tenantStore}.  The proxy intercepts
 * `pool.connect()` and runs
 * `SELECT set_config('app.current_tenant_id', $1, false)`
 * before handing the connection to Kysely, activating the Row-Level Security
 * policies created in migration 025.
 *
 * Usage:
 * ```ts
 * import { db } from '../db/kysely.js';
 *
 * const rows = await db
 *   .selectFrom('records')
 *   .selectAll()
 *   .where('object_id', '=', objectId)
 *   .execute();
 * ```
 *
 * Because RLS is applied automatically, service code does not need to add
 * `where('tenant_id', '=', tenantId)` — Postgres filters the rows for us.
 * The tenant filter is still safe (and recommended) as defence-in-depth.
 *
 * The {@link DB} type is generated from the live database schema by
 * `kysely-codegen` (`npm run db:types --workspace @cpcrm/api`).  Do not edit
 * `kysely.types.ts` by hand — re-run the codegen after every SQL migration.
 */
export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});
