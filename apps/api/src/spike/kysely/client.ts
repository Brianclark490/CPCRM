/**
 * Kysely Database Client
 *
 * Type-safe query builder wrapping the existing pg pool.
 */

import { Kysely, PostgresDialect } from 'kysely';
import { pool as rawPool } from '../../db/client.js';
import type { Database } from './database.types.js';

/**
 * Kysely database instance.
 *
 * Uses the existing RLS-aware pool from db/client.ts, so tenant isolation
 * is handled automatically via the proxy layer.
 */
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: rawPool,
  }),
});
