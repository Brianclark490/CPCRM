# ADR-002: Tenant Data Model

## Status

Accepted

## Context

CPCRM is a multi-tenant CRM platform. Before implementing any business data, the team needs to agree on:

- What "tenant" and "organisation" mean in this platform's domain
- How application data is isolated between tenants
- How users are associated with tenants
- How CRM entities (accounts, contacts, opportunities) relate to tenants
- What tenant identifier strategy to use in the database
- How tenant resolution aligns with the Descope authentication approach

## Decisions

### 1. Tenant and Organisation Concepts

**Tenant** is the root isolation boundary. It represents a company or team that subscribes to CPCRM. All data in the system belongs to exactly one tenant, and no data is shared between tenants.

**Organisation** is a logical grouping of users within a tenant. Initially, every tenant has exactly one organisation, which represents the tenant's own business. The model supports multiple organisations per tenant to accommodate enterprise scenarios (e.g. regional divisions or acquired companies) without requiring a schema change.

| Concept      | Role                                                                     | Example                          |
|--------------|--------------------------------------------------------------------------|----------------------------------|
| Tenant       | Root isolation boundary; the subscribing entity                          | "Acme Corp (CPCRM subscription)" |
| Organisation | A user grouping within a tenant; initially 1:1 with tenant               | "Acme Corp (Sales UK)"           |
| Account      | A CRM entity — a business/company being tracked as a prospect/customer   | "Microsoft"                      |
| Contact      | A CRM entity — an individual at an Account                               | "Jane Smith at Microsoft"        |
| Opportunity  | A CRM entity — a potential deal linked to an Account                     | "Microsoft Azure renewal Q3"     |

### 2. Tenant Identifier Strategy

**Decision:** Every application table carries a `tenant_id` UUID column. All queries filter by `tenant_id` to enforce isolation.

**Rationale:**

- A shared-schema, tenant-discriminator approach (single database, `tenant_id` column on every row) is appropriate for the current team size and workload. It avoids the operational overhead of schema-per-tenant or database-per-tenant while still enabling strong isolation at the query layer.
- UUID v4 is used as the tenant identifier to avoid enumeration attacks and to allow distributed ID generation without coordination.
- The `tenant_id` is always required — it is never nullable on application tables (accounts, contacts, opportunities, etc.).
- Application code must include `tenant_id` in every database query. Omitting it is a bug and will be caught in code review.

**Tenant slug** is a separate, URL-safe, human-readable string (e.g. `"acme-corp"`) used only for subdomain routing. The slug is unique and maps 1:1 to a tenant UUID. All internal logic uses the UUID; the slug is only used at the routing layer.

### 3. Tenant Resolution Strategy

**Decision:** Tenant context is resolved at the API layer by one of two mechanisms, evaluated in order:

1. **Descope JWT tenant claim** — when a user authenticates via a Descope tenant-scoped flow, the JWT contains a `tenants` claim (a map of tenant IDs to roles). The first (and typically only) tenant ID from this map is used as the active tenant.
2. **Subdomain routing** — the `Host` request header is parsed to extract the subdomain (e.g. `acme-corp` from `acme-corp.cpcrm.com`), which is looked up in the `tenants` table to resolve the tenant UUID.

The resolved `tenantId` is attached to the request object by API middleware and must be present on all protected routes that access tenant-scoped data.

### 4. User Association with Tenants

**Decision:** Users are identified exclusively by their Descope user ID (the `sub` JWT claim). CPCRM does not maintain a separate users table; Descope is the authoritative source of user identity.

The `tenant_memberships` table associates a Descope user ID with a tenant and assigns them a role. A user may be a member of multiple tenants. The optional `organisation_id` column allows scoping a membership to a specific organisation within a tenant.

Roles within a tenant:

| Role   | Permissions                                                            |
|--------|------------------------------------------------------------------------|
| owner  | Full control — manage members, billing, and all CRM records            |
| admin  | Manage members and all CRM records within the tenant                   |
| member | Read and write CRM records; cannot manage tenant settings or members   |

### 5. CRM Entity Relationships

All CRM entities carry a `tenant_id` and are always queried with a tenant filter. The entity relationships are:

```
Tenant (1) ──── (*) Organisation
Tenant (1) ──── (*) TenantMembership ──── (1) User [Descope]
                                    └──── (1, optional) Organisation

Tenant (1) ──── (*) Account
Account (1) ──── (*) Contact
Account (1) ──── (*) Opportunity
Opportunity (*) ──── (1) TenantMember [owner]
```

### 6. Database Schema

The following tables implement the model. All tables use UUID primary keys and include `created_at` / `updated_at` audit columns.

See `apps/api/src/db/migrations/001_initial_schema.sql` for the full schema definition.

## Assumptions and Constraints

| # | Assumption / Constraint |
|---|-------------------------|
| 1 | A single PostgreSQL database is used for all tenants (shared-schema model). |
| 2 | Tenant isolation is enforced exclusively at the application query layer. Row-level security (RLS) is a future hardening option but is not required at this stage. |
| 3 | Descope is the authoritative source of user identity. User profile data (name, email) is read from the JWT and not persisted in CPCRM's database. |
| 4 | A Descope user ID maps to at most one membership per tenant. |
| 5 | Every tenant starts with exactly one organisation. Multi-organisation support is schema-compatible but not enforced by application logic in the initial release. |
| 6 | `tenant_id` is mandatory and non-nullable on all application tables. Any query missing a tenant filter is a defect. |
| 7 | Tenant slugs are immutable after creation. Changing a slug would break existing subdomain routes and bookmarks. |
| 8 | The `value` field on Opportunity is stored as a numeric type; currency is tracked separately as an ISO 4217 code. |
| 9 | Soft-delete (`deleted_at` column) is not included in the initial schema to keep it simple. It should be added before production if auditing or undo functionality is required. |

## Consequences

- The `@cpcrm/types` shared package exports TypeScript interfaces for all domain entities defined here. All application code should import types from this package to ensure consistency.
- API middleware (`requireAuth`) attaches `tenantId` to the request object. Route handlers must use this value when querying the database and must reject requests where `tenantId` is absent on tenant-scoped endpoints.
- Adding new CRM entities requires: (a) a new TypeScript interface in `@cpcrm/types`, (b) a new migration adding the table with a `tenant_id` column and foreign key, and (c) route-level enforcement of tenant scoping.
- Future support for row-level security in PostgreSQL can be introduced without changing application types or the overall strategy.
