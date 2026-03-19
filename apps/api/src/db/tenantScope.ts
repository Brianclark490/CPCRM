import type pg from 'pg';

/**
 * A thin wrapper around a PostgreSQL {@link pg.Pool} that carries the active
 * tenant ID.  Service functions accept a `TenantScopedClient` instead of
 * importing the shared pool directly, which makes the tenant context explicit
 * in the type system — TypeScript will reject calls that forget to supply it.
 *
 * The wrapper does **not** rewrite SQL automatically.  Each service is still
 * responsible for including `tenant_id = $N` in its queries, but having the
 * tenant ID readily available via `client.tenantId` makes that easy and
 * prevents the value from being "lost" across function boundaries.
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

  /** Executes a parameterised query via the underlying pool. */
  async query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
    return this.pool.query(text, params);
  }

  /**
   * Checks out a client from the pool for use inside a transaction.
   * The caller **must** call `client.release()` when finished.
   */
  async connect(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }
}
