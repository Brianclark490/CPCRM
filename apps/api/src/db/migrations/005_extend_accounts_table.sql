-- Migration: 005_extend_accounts_table
-- Description: Extends the accounts table with contact information, address,
--              notes, and owner fields as required by the CRM schema.
--              Makes opportunities.account_id nullable (optional) and converts
--              it back to UUID with a foreign key to accounts(id).
--
-- Depends on: 001_initial_schema, 002_add_stage_history_and_relax_constraints

-- ── Accounts — add missing columns ─────────────────────────────────────────

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone         VARCHAR(50);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email         VARCHAR(255);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS city          VARCHAR(100);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS region        VARCHAR(100);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS postal_code   VARCHAR(20);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS country       VARCHAR(100);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notes         TEXT;

-- owner_id: the Descope user ID of the account owner.
-- Default existing rows to the created_by value, then enforce NOT NULL.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255);
UPDATE accounts SET owner_id = created_by WHERE owner_id IS NULL;
ALTER TABLE accounts ALTER COLUMN owner_id SET NOT NULL;

-- ── Accounts — indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_accounts_name     ON accounts (name);
CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON accounts (owner_id);

-- ── Opportunities — make account_id nullable and reinstate FK ──────────────

-- Allow NULLs so opportunities can exist without an account.
ALTER TABLE opportunities ALTER COLUMN account_id DROP NOT NULL;

-- Clean up any non-UUID values before converting back to UUID.
UPDATE opportunities SET account_id = NULL
 WHERE account_id IS NOT NULL
   AND account_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

ALTER TABLE opportunities
  ALTER COLUMN account_id TYPE UUID USING account_id::uuid;

-- Reinstate the foreign key (dropped in migration 002).
ALTER TABLE opportunities
  ADD CONSTRAINT fk_opportunities_account_id
  FOREIGN KEY (account_id) REFERENCES accounts (id);

-- Ensure index exists (created in 001, but safe to be explicit).
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities (account_id);
