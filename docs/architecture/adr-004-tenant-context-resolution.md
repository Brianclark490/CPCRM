# ADR-004: Tenant Context Resolution

## Status

Accepted

## Context

CPCRM is a multi-tenant platform. Every API request that accesses business data must know **which tenant** that data belongs to before any query is executed. Without a reliable, consistently applied mechanism for deriving the active tenant from an incoming request, cross-tenant data access becomes possible — the primary horizontal privilege escalation risk in a shared-schema multi-tenant system.

ADR-002 defined the tenant data model and introduced the concept of tenant resolution from the Descope JWT. ADR-003 defined the two-layer isolation enforcement model (middleware + query layer). This ADR focuses exclusively on the **resolution lifecycle**: how the tenant ID is determined from an authenticated request, what happens in every possible outcome, and how this guides API and data-access implementation.

---

## Decisions

### 1. Tenant Context Is Resolved Exclusively at the API Middleware Layer

The active tenant context is resolved once per request by the `requireAuth` Express middleware, before any route handler or business logic runs. The resolved `tenantId` is attached to `req.user` as a typed string. All downstream code reads from this single, authoritative source.

No route handler or service function resolves the tenant independently. Resolution is centralised so that the approach can change (e.g., adding subdomain support) without touching route handlers.

### 2. Resolution Sources — Evaluated in Order

The `requireAuth` middleware resolves the tenant using the following sources, evaluated in priority order:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (primary) | **Descope JWT `tenants` claim** | After the session token is validated by the Descope SDK, the JWT payload is inspected for a `tenants` claim. This is a JSON object whose keys are tenant IDs and whose values contain per-tenant role metadata. The first (and normally only) key is used as the active tenant ID. |
| 2 (planned) | **Subdomain routing** | If the JWT carries no tenant claim, the `Host` request header can be inspected (e.g. `acme-corp.cpcrm.com`) and the subdomain looked up in the `tenants` table to resolve the tenant UUID. This fallback is not yet implemented. |

When the subdomain fallback is implemented, it must update `req.user.tenantId` before the `requireTenant` middleware is reached. The `requireTenant` contract does not change.

### 3. Relationship Between Authenticated Identity, Organisation Membership, and Tenant Context

The three concepts are related but distinct:

| Concept | Source of Truth | What It Represents |
|---------|-----------------|-------------------|
| **Authenticated Identity** (`userId`) | Descope JWT `sub` claim | Who is making the request. A stable, unique identifier for the user across all tenants. |
| **Active Tenant** (`tenantId`) | Descope JWT `tenants` claim (or subdomain fallback) | Which tenant's data may be accessed during this request. |
| **Organisation Membership** | `tenant_memberships` database table | The user's role within the active tenant, and optionally their scoped organisation. |

The resolution chain for a protected request is:

```
Incoming request
  → requireAuth validates JWT, extracts userId + tenantId
      → requireTenant asserts tenantId is present
          → Route handler reads req.user.tenantId (guaranteed non-null)
              → Service queries DB with tenant_id filter
                  → (Optional) Membership lookup for role-based access control
```

Organisation membership is **not** consulted during tenant resolution. The JWT-derived `tenantId` is sufficient to scope all queries. Membership details (role, organisation scoping) are only needed for additional authorisation checks within a route handler.

### 4. Resolution Outcomes and Request Behaviour

Every possible outcome of tenant context resolution has a defined, deterministic behaviour:

| Outcome | Condition | HTTP Response | Notes |
|---------|-----------|---------------|-------|
| **Resolved** | JWT contains exactly one tenant claim | Continues to next middleware / handler | `req.user.tenantId` set to the resolved UUID. |
| **Ambiguous** | JWT contains multiple tenant claims | Continues — first tenant claim used; warning logged | Multi-tenant tokens are not a current product requirement. If this occurs, it is likely a Descope configuration issue. A structured warning is emitted so it can be tracked in Application Insights. |
| **Missing** | JWT contains no tenant claim (or empty `tenants` object) | `403 Forbidden` — `{ "error": "No active tenant context for this user" }` | Rejected by `requireTenant`. Applies to users who have authenticated via a non-tenant-scoped Descope flow (e.g., a platform-level admin account). |
| **Invalid token** | Token signature invalid, expired, or malformed | `401 Unauthorized` — `{ "error": "Invalid or expired token" }` | Rejected by `requireAuth` before tenant resolution is attempted. |
| **No token** | `Authorization` header absent or not a Bearer token | `401 Unauthorized` — `{ "error": "Missing or invalid Authorization header" }` | Rejected by `requireAuth` before tenant resolution is attempted. |

There is no partial success path. A request either has a fully resolved, trusted tenant context or it is rejected before reaching business logic.

### 5. Trust Model for Resolved Tenant Identity

The `tenantId` extracted from the Descope JWT is **trusted without a database round-trip** on every request. This decision is consistent with ADR-002 and ADR-003:

- The Descope SDK validates the JWT signature and expiry before any claim is read.
- Descope is the authoritative source of user-to-tenant membership; a user's JWT only carries tenant claims for tenants to which they have been explicitly enrolled.
- Re-validating membership in the database on every request would add latency and database load for no security gain in the current threat model.

**When a stricter membership check is needed** (e.g., to enforce fine-grained role access or to detect revoked memberships without waiting for JWT expiry), a database lookup against `tenant_memberships` can be added to the middleware chain between `requireAuth` and `requireTenant` without changing the existing contract of either middleware.

### 6. Middleware Composition Contract

Tenant context resolution depends on the following immutable middleware ordering:

```typescript
router.get('/resource', requireAuth, requireTenant, handler);
```

- `requireAuth` **must** run first — it validates the JWT and sets `req.user`.
- `requireTenant` **must** run second — it asserts `req.user.tenantId` is present.
- Route handlers **must** run after both — they can safely read `req.user.tenantId` as a non-nullable `string`.

Omitting `requireAuth` before `requireTenant` will cause `requireTenant` to reject every request (since `req.user` is undefined). Omitting `requireTenant` on a tenant-scoped route is a defect; the database query layer provides secondary enforcement via `tenant_id` filters.

---

## Assumptions and Constraints

| # | Assumption / Constraint |
|---|-------------------------|
| 1 | Descope JWT tokens are short-lived. Token revocation is handled by JWT expiry rather than a database revocation list. |
| 2 | A Descope user authenticating via a tenant-scoped flow always receives exactly one tenant claim in their JWT. Multiple tenant claims in a single token are not a supported use case and will produce a warning log. |
| 3 | The `tenants` claim key is the CPCRM-internal tenant UUID (not the Descope tenant ID). This alignment is established during tenant provisioning: when a tenant is created in CPCRM, the same UUID is registered as the tenant identifier within Descope. Any mismatch between the Descope tenant ID and the CPCRM tenant UUID will result in a tenant resolution failure (403). |
| 4 | Subdomain-based resolution is not yet implemented. Until it is, users must authenticate via a Descope tenant-scoped flow to receive a tenant claim. |
| 5 | Platform-level administrator accounts (not scoped to any tenant) are expected to have no tenant claim. They are intentionally blocked from accessing tenant-scoped routes. |
| 6 | The `resolveTenantId` helper in `requireAuth` is an internal implementation detail. It must not be called outside the auth middleware. |
| 7 | JWT claim names (`tenants`, `sub`, `email`, `name`) are determined by the Descope token configuration. Changes to the Descope project's custom claims require a corresponding change to the auth middleware. |

---

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should CPCRM support users switching between tenants within a single session (multi-tenancy per session) in future? | If yes, a tenant-selection step after authentication would be needed, potentially replacing the JWT-claim approach. |
| 2 | When will subdomain-based resolution be implemented? | Until it is available, onboarding requires a Descope tenant-scoped flow. |
| 3 | Should revoked tenant memberships take effect before JWT expiry? | If yes, a database membership check on each request (or a short-lived membership cache) will be required. |

---

## Consequences

- Every route that accesses tenant-scoped data must use the pattern `requireAuth → requireTenant → handler`. This is a hard convention enforced by code review.
- Route handlers and service functions can safely read `req.user.tenantId` as a `string` after `requireTenant` has passed — no null-check is required downstream.
- The `tenantId` value passed to every database query is always the JWT-derived UUID. Service functions receive the `tenantId` as an explicit parameter (not read from a global or thread-local context).
- Ambiguous tenant context (multiple JWT tenant claims) is logged at `warn` level with `tenantCount` and `userId` fields so it can be monitored in Application Insights.
- Future additions to the resolution chain (subdomain lookup, membership check) can be inserted before `requireTenant` without changing route handler code.
- The design is intentionally simple for the current team size and workload. The trust model, resolution order, and middleware contract are documented here so that any change is considered explicitly and recorded as a subsequent ADR.

## Related

- [ADR-002: Tenant Data Model](./adr-002-tenant-data-model.md)
- [ADR-003: Tenant Isolation Enforcement](./adr-003-tenant-isolation-enforcement.md)
- [Authentication: Descope Setup](../authentication/descope-setup.md)
