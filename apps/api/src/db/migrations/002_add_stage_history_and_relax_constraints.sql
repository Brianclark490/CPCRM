-- Migration: 002_add_stage_history_and_relax_constraints
-- Description: Prepares the schema for the live API service layer.
--
--   1. Adds stage_history JSONB column to opportunities so the full pipeline
--      audit trail is persisted alongside the current stage.
--
--   2. Drops the FK from opportunities.account_id to accounts(id) and widens
--      the column to TEXT.  Account management is not yet implemented via the
--      API, so enforcing a FK at this stage would block all opportunity writes.
--      The constraint can be reinstated once the accounts service is live.
--
--   3. Drops the FK from organisations.tenant_id  / tenant_memberships.tenant_id
--      to tenants(id) and widens both columns to TEXT.  Tenant identifiers
--      originate from Descope JWTs (string sub-claims) and are not UUIDs
--      maintained in the local tenants table, so the FK can never be satisfied.
--
-- All changes are backward-compatible — existing rows are preserved.

-- ── Opportunities ──────────────────────────────────────────────────────────────

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS stage_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Relax account_id: drop FK and widen to TEXT
ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_account_id_fkey;

ALTER TABLE opportunities
  ALTER COLUMN account_id TYPE TEXT;

-- ── Organisations ─────────────────────────────────────────────────────────────

-- Relax tenant_id: drop FK and widen to TEXT
ALTER TABLE organisations
  DROP CONSTRAINT IF EXISTS organisations_tenant_id_fkey;

ALTER TABLE organisations
  ALTER COLUMN tenant_id TYPE TEXT;

-- ── Tenant Memberships ────────────────────────────────────────────────────────

-- Relax tenant_id: drop FK and widen to TEXT
ALTER TABLE tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_tenant_id_fkey;

ALTER TABLE tenant_memberships
  ALTER COLUMN tenant_id TYPE TEXT;

-- Relax organisation_id: drop FK (organisation now stored by service-generated UUID string)
ALTER TABLE tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_organisation_id_fkey;

ALTER TABLE tenant_memberships
  ALTER COLUMN organisation_id TYPE TEXT;
