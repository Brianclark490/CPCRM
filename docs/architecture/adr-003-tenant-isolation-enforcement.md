# ADR-003: Tenant Isolation Enforcement

## Status

Accepted

## Context

ADR-002 defined the tenant data model: all application tables carry a `tenant_id` discriminator column, and all queries must filter by that column. This ADR defines how isolation is **enforced** at runtime — what prevents a request from reading or writing another tenant's data.

The risk being addressed is a horizontal privilege escalation: an authenticated user at tenant A making API calls that return or modify data belonging to tenant B.

## Decisions

### 1. Two-layer enforcement model

Tenant isolation is enforced at two complementary layers:

| Layer | Mechanism | Responsibility |
|-------|-----------|----------------|
| **Application (API middleware)** | `requireTenant` middleware — rejects requests that carry no resolved `tenantId` | Prevents route handlers from executing without a known tenant context |
| **Database (query layer)** | Every query against a tenant-scoped table includes a `WHERE tenant_id = $tenantId` clause | Ensures the database never returns data outside the caller's tenant boundary |

The two layers are intentionally redundant. The middleware layer provides an early, consistent rejection point. The query layer provides the hard enforcement that remains correct even if a future route forgets the middleware.

### 2. `requireTenant` middleware

A dedicated Express middleware function (`apps/api/src/middleware/tenant.ts`) is provided:

```typescript
export function requireTenant(req, res, next): void
```

**Behaviour:**
- Must be composed **after** `requireAuth` so that `req.user` is populated.
- Checks `req.user?.tenantId`. If absent, responds with `HTTP 403` and the body `{ error: 'No active tenant context for this user' }`.
- If `tenantId` is present, calls `next()` unchanged — the tenant context is already attached to `req.user`.

**Usage pattern for all tenant-scoped routes:**
```typescript
router.get('/accounts', requireAuth, requireTenant, handler);
```

Any route that reads or writes tenant-scoped CRM data (accounts, contacts, opportunities) **must** include `requireTenant` in its middleware chain.

### 3. Tenant context resolution (from ADR-002, restated for clarity)

The `requireAuth` middleware resolves `tenantId` from the Descope JWT `tenants` claim before `requireTenant` is ever consulted. If the token carries no tenant claim, `tenantId` will be `undefined`, and `requireTenant` will reject the request with 403.

Resolution order:
1. **JWT `tenants` claim** — Descope includes this when a user authenticates within a tenant-scoped flow. The first key of the `tenants` object is used as the active tenant ID.
2. **Subdomain routing** (planned) — If the JWT carries no tenant, the API can fall back to parsing the `Host` header (e.g. `acme-corp.cpcrm.com`) and looking up the tenant by slug. This is not yet implemented; when added, it should update `req.user.tenantId` before `requireTenant` is reached.

### 4. Database query enforcement

All queries against CRM tables must include a `tenant_id` filter. The pattern used in every route handler is:

```sql
SELECT * FROM accounts WHERE tenant_id = $1 AND id = $2
```

The `tenantId` value is always taken from `req.user.tenantId` (guaranteed non-null by `requireTenant`). Parameters are always passed as placeholders — never interpolated into SQL strings — to prevent SQL injection.

Omitting `tenant_id` from a query is a defect and must be caught in code review. A future hardening step (Row-Level Security) is noted in the Assumptions section below.

### 5. User-to-tenant membership validation

`requireTenant` confirms that a `tenantId` is present in the token but does **not** re-verify membership in the database on every request. Membership correctness is delegated to Descope: a user's JWT only carries tenant claims for tenants to which Descope has confirmed they belong. This is consistent with the decision in ADR-002 to treat Descope as the authoritative identity source.

If stricter membership validation is required in future (e.g. to support role-based access to specific records), a database lookup against `tenant_memberships` can be added to the middleware chain without changing the existing `requireTenant` contract.

### 6. Row-Level Security (RLS) — database-level enforcement

PostgreSQL Row-Level Security provides a third enforcement layer that operates inside the database engine itself. Even if a service query accidentally omits `WHERE tenant_id = $N`, the RLS policy prevents data from leaking across tenants.

**Migration:** `025_enable_row_level_security.sql` enables RLS with `FORCE ROW LEVEL SECURITY` on all 22 tenant-scoped tables.

**Policies (per table):**

| Policy | Type | Purpose |
|--------|------|---------|
| `tenant_isolation` | PERMISSIVE | `USING (tenant_id = current_setting('app.current_tenant_id', true))` — restricts visibility to the active tenant |
| `tenant_isolation_bypass` | PERMISSIVE | `USING (current_setting('app.current_tenant_id', true) IS NULL OR = '')` — allows unrestricted access when no tenant context is set (migrations, admin scripts, seed jobs) |

Because both policies are `PERMISSIVE`, PostgreSQL OR's them:
- **App request with tenant context** → only matching tenant's rows are visible.
- **Migration / admin (no context set)** → all rows are visible.

**Context propagation:**

1. `requireTenant` middleware stores the resolved `tenantId` in a Node.js `AsyncLocalStorage` (`apps/api/src/db/tenantContext.ts`).
2. The pool proxy in `apps/api/src/db/client.ts` reads the stored tenant ID on every `pool.query()` and `pool.connect()` call.
3. Before executing the caller's SQL, the proxy calls `set_config('app.current_tenant_id', tenantId, false)` on the checked-out connection, activating the RLS policies.
4. After the query, the proxy calls `RESET app.current_tenant_id` and releases the connection back to the pool.

The `TenantScopedClient` wrapper (`apps/api/src/db/tenantScope.ts`) performs the same `set_config` / `RESET` cycle for code that explicitly constructs a scoped client.

**Tables with RLS enabled (22):**
`accounts`, `contacts`, `opportunities`, `organisations`, `object_definitions`, `field_definitions`, `relationship_definitions`, `layout_definitions`, `layout_fields`, `pipeline_definitions`, `stage_definitions`, `stage_gates`, `stage_history`, `records`, `record_relationships`, `object_permissions`, `teams`, `team_members`, `lead_conversion_mappings`, `page_layouts`, `page_layout_versions`, `sales_targets`.

**Tables without RLS:** `tenants`, `tenant_memberships`, `user_profiles`, `schema_migrations` — these are either root-level identity tables or not tenant-scoped.

## Assumptions and Constraints

| # | Assumption / Constraint |
|---|-------------------------|
| 1 | Tenant isolation uses a three-layer model: middleware (early rejection), query layer (`WHERE tenant_id`), and RLS (database-level policy). The layers are intentionally redundant. |
| 2 | Descope JWT tenant claims are trusted after `requireAuth` validates the token signature. No additional membership DB lookup is performed on every request. |
| 3 | Row-Level Security (RLS) in PostgreSQL is active on all tenant-scoped tables. `FORCE ROW LEVEL SECURITY` ensures policies apply even when the connecting role owns the tables. |
| 4 | A user with a valid token but no tenant claim (e.g. a platform administrator not scoped to any tenant) cannot access tenant-scoped routes. This is intentional. |
| 5 | Multi-tenant token support (a single JWT with multiple tenant claims) is not a current requirement. The first tenant ID found in the `tenants` claim is used as the active tenant. |
| 6 | Subdomain-based tenant resolution is defined in ADR-002 as a fallback path but is not yet implemented. Until it is, users must authenticate via a Descope tenant-scoped flow to receive a `tenantId` in their token. |
| 7 | When no `app.current_tenant_id` session variable is set (migrations, seed scripts), the `tenant_isolation_bypass` policy allows unrestricted access. This is safe because those code paths run at startup or as admin tasks, never in the context of an end-user request. |

## Consequences

- All route handlers that access tenant-scoped data must include `requireTenant` in their middleware chain, after `requireAuth`.
- Route handlers can safely read `req.user.tenantId` as a `string` (non-nullable) after `requireTenant` has passed.
- The `requireTenant` middleware is independently testable without mocking Descope.
- New CRM routes must follow the pattern: `requireAuth → requireTenant → handler`.
- Existing middleware tests cover: tenant resolution from JWT, absent tenant rejection (403), and correct tenant pass-through.
- All `pool.query()` and `pool.connect()` calls within a request automatically have the RLS tenant context set, thanks to the pool proxy and `AsyncLocalStorage`.
- New tenant-scoped tables **must** have `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and the two standard policies (`tenant_isolation`, `tenant_isolation_bypass`) added in their migration.
