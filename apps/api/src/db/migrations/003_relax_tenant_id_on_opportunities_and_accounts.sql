-- Migration: 003_relax_tenant_id_on_opportunities_and_accounts
-- Description: Drops the FK from opportunities.tenant_id and accounts.tenant_id
--              to tenants(id) and widens both columns to TEXT.
--
--              Tenant identifiers originate from Descope JWTs (string sub-claims)
--              and are not UUIDs maintained in the local tenants table, so the FK
--              can never be satisfied.  Migration 002 applied the same fix to
--              organisations and tenant_memberships; this migration completes the
--              pattern for the remaining CRM entity tables.
--
-- All changes are backward-compatible — existing rows are preserved.

-- ── Opportunities ─────────────────────────────────────────────────────────────

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_tenant_id_fkey;

ALTER TABLE opportunities
  ALTER COLUMN tenant_id TYPE TEXT;

-- ── Accounts ──────────────────────────────────────────────────────────────────

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_tenant_id_fkey;

ALTER TABLE accounts
  ALTER COLUMN tenant_id TYPE TEXT;
