/**
 * Drizzle Database Client
 *
 * Type-safe ORM wrapping the existing pg pool.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { pool as rawPool } from '../../db/client.js';
import * as schema from './schema.js';

/**
 * Drizzle database instance.
 *
 * Uses the existing RLS-aware pool from db/client.ts, so tenant isolation
 * is handled automatically via the proxy layer.
 */
export const db = drizzle(rawPool, { schema });
