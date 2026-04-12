import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped storage for the active tenant ID.
 *
 * The `requireTenant` middleware calls `tenantStore.run(tenantId, next)` so
 * that every downstream function — including `pool.query()` — can retrieve the
 * tenant ID without it being threaded through every call-site.
 *
 * The RLS-aware pool wrapper in `client.ts` reads this value via
 * {@link getCurrentTenantId} and calls
 * `set_config('app.current_tenant_id', ...)` on the checked-out connection,
 * activating the Postgres Row-Level Security policies.
 */
export const tenantStore = new AsyncLocalStorage<string>();

/** Returns the tenant ID for the current request, or `undefined` outside a request. */
export function getCurrentTenantId(): string | undefined {
  return tenantStore.getStore();
}
