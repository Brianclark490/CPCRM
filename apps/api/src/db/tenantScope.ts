import type pg from 'pg';

/**
 * A thin wrapper around a PostgreSQL {@link pg.Pool} that carries the active
 * tenant ID and sets the RLS session variable before every query.
 *
 * Service functions accept a `TenantScopedClient` instead of importing the
 * shared pool directly, which makes the tenant context explicit in the type
 * system — TypeScript will reject calls that forget to supply it.
 *
 * Each query checks out a connection from the pool, calls
 * `set_config('app.current_tenant_id', tenantId, true)` (transaction-local),
 * executes the caller's SQL, and releases the connection.  The RLS policies
 * created in migration 025 use `current_setting('app.current_tenant_id', true)`
 * to filter rows, so even a missing `WHERE tenant_id = $N` clause cannot leak
 * data across tenants.
 *
 * Usage (in a route handler):
 * ```ts
 * const tenant = new TenantScopedClient(pool, req.user!.tenantId!);
 * const result = await someService(tenant, ...);
 * ```
 */
export class TenantScopedClient {
  constructor(
    private readonly pool: pg.Pool,
    public readonly tenantId: string,
  ) {
    if (!tenantId) {
      throw new Error('TenantScopedClient requires a non-empty tenantId');
    }
  }

  /**
   * Executes a parameterised query with RLS tenant context.
   *
   * A dedicated connection is checked out, the `app.current_tenant_id`
   * session variable is set (session-scoped), the query runs, the variable
   * is reset, and the connection is returned to the pool.
   */
  async query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
    const client = await this.pool.connect();
    try {
      await client.query(
        "SELECT set_config('app.current_tenant_id', $1, false)",
        [this.tenantId],
      );
      return await client.query(text, params);
    } finally {
      // Reset the tenant context before returning the connection to the pool
      // so a subsequent checkout never inherits a stale tenant ID.
      await client.query("RESET app.current_tenant_id").catch(() => {});
      client.release();
    }
  }

  /**
   * Checks out a client from the pool for use inside a transaction.
   * The caller **must** call `client.release()` when finished.
   *
   * The `app.current_tenant_id` session variable is set automatically on the
   * checked-out connection.  Callers managing their own transactions should
   * use `SET LOCAL app.current_tenant_id` after `BEGIN` for transaction-scoped
   * isolation if they prefer the setting to roll back with the transaction.
   */
  async connect(): Promise<pg.PoolClient> {
    const client = await this.pool.connect();
    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, false)",
      [this.tenantId],
    );
    return client;
  }
}
