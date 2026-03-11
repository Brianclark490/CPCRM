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

## Assumptions and Constraints

| # | Assumption / Constraint |
|---|-------------------------|
| 1 | Tenant isolation at the query layer is the primary enforcement mechanism. The middleware layer is a defence-in-depth measure. |
| 2 | Descope JWT tenant claims are trusted after `requireAuth` validates the token signature. No additional membership DB lookup is performed on every request. |
| 3 | Row-Level Security (RLS) in PostgreSQL is a future hardening option. It is not required at this stage but can be introduced without changing application types or the overall strategy. |
| 4 | A user with a valid token but no tenant claim (e.g. a platform administrator not scoped to any tenant) cannot access tenant-scoped routes. This is intentional. |
| 5 | Multi-tenant token support (a single JWT with multiple tenant claims) is not a current requirement. The first tenant ID found in the `tenants` claim is used as the active tenant. |
| 6 | Subdomain-based tenant resolution is defined in ADR-002 as a fallback path but is not yet implemented. Until it is, users must authenticate via a Descope tenant-scoped flow to receive a `tenantId` in their token. |

## Consequences

- All route handlers that access tenant-scoped data must include `requireTenant` in their middleware chain, after `requireAuth`.
- Route handlers can safely read `req.user.tenantId` as a `string` (non-nullable) after `requireTenant` has passed.
- The `requireTenant` middleware is independently testable without mocking Descope.
- New CRM routes must follow the pattern: `requireAuth → requireTenant → handler`.
- Existing middleware tests cover: tenant resolution from JWT, absent tenant rejection (403), and correct tenant pass-through.
