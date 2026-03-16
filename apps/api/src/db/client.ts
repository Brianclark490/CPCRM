import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  const msg =
    'DATABASE_URL environment variable is not set. ' +
    'Configure it in Azure App Service → Environment variables, or in your local .env file.';
  if (process.env.NODE_ENV === 'production') {
    // Fail hard in production — a missing connection string is always a misconfiguration.
    throw new Error(msg);
  } else {
    // Warn in development so the error is obvious rather than a confusing ECONNREFUSED.
    console.warn(`[db/client] WARNING: ${msg}`);
  }
}

/**
 * Shared PostgreSQL connection pool.
 *
 * The pool is initialised once at module load and reused across all requests.
 * DATABASE_URL must be set in the environment (or Azure Key Vault reference).
 *
 * SSL is enforced in production (Azure Database for PostgreSQL requires it).
 * It is left disabled locally so developers can run without certificate setup.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
