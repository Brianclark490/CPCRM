import pg from 'pg';
import { getCurrentTenantId } from './tenantContext.js';

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
const rawPool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/**
 * RLS-aware pool proxy.
 *
 * When a request-scoped tenant ID is present in {@link tenantStore}, the proxy
 * intercepts `pool.query()` and `pool.connect()` to call
 * `set_config('app.current_tenant_id', tenantId)` on the checked-out
 * connection.  This activates the Row-Level Security policies created in
 * migration 025_enable_row_level_security so that Postgres itself enforces
 * tenant isolation — even if a service query accidentally omits the
 * `WHERE tenant_id = $N` clause.
 *
 * When no tenant context is present (migrations, health checks, admin jobs),
 * calls pass through to the raw pool unchanged and the RLS bypass policy
 * allows unrestricted access.
 */
export const pool: pg.Pool = new Proxy(rawPool, {
  get(target, prop, receiver) {
    if (prop === 'query') {
      return async (...args: unknown[]) => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
          // No tenant context — pass through to raw pool (bypass policy applies)
          return (target.query as Function)(...args);
        }
        // Tenant context present — set RLS variable on a dedicated connection
        const client = await target.connect();
        try {
          await client.query(
            "SELECT set_config('app.current_tenant_id', $1, false)",
            [tenantId],
          );
          return await (client.query as Function)(...args);
        } finally {
          await client.query('RESET app.current_tenant_id').catch(() => {});
          client.release();
        }
      };
    }

    if (prop === 'connect') {
      return async () => {
        const client = await target.connect();
        const tenantId = getCurrentTenantId();
        if (tenantId) {
          await client.query(
            "SELECT set_config('app.current_tenant_id', $1, false)",
            [tenantId],
          );
        } else {
          // Reset any stale context from a previous checkout
          await client.query('RESET app.current_tenant_id').catch(() => {});
        }
        return client;
      };
    }

    return Reflect.get(target, prop, receiver);
  },
});
