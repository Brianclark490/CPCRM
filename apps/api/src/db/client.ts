import pg from 'pg';

const { Pool } = pg;

/**
 * Resolve the PostgreSQL connection string.
 *
 * Resolution order:
 * 1. DATABASE_URL — a full connection string (e.g. from Key Vault or .env)
 * 2. Individual AZURE_POSTGRESQL_* variables — set automatically by Azure
 *    Service Connector when linking an App Service to a PostgreSQL database
 *
 * Returns the resolved connection string, or undefined if neither source is available.
 */
function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.AZURE_POSTGRESQL_HOST;
  const port = process.env.AZURE_POSTGRESQL_PORT ?? '5432';
  const database = process.env.AZURE_POSTGRESQL_DATABASE;
  const user = process.env.AZURE_POSTGRESQL_USER;
  const password = process.env.AZURE_POSTGRESQL_PASSWORD;
  const ssl = process.env.AZURE_POSTGRESQL_SSL;

  if (host && database && user && password) {
    const sslMode = ssl === 'true' || ssl === 'require' ? 'require' : 'prefer';
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?sslmode=${sslMode}`;
  }

  return undefined;
}

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
  const msg =
    'Database connection is not configured. ' +
    'Set DATABASE_URL or the AZURE_POSTGRESQL_* environment variables ' +
    'in Azure App Service → Environment variables, or in your local .env file.';
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
 * Provide either DATABASE_URL or the individual AZURE_POSTGRESQL_* variables.
 *
 * SSL is enforced in production (Azure Database for PostgreSQL requires it).
 * It is left disabled locally so developers can run without certificate setup.
 */
export const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
