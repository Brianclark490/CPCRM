-- Migration: 001_initial_schema
-- Description: Tenant data model — tenants, organisations, memberships, and core CRM entities.
--              See docs/architecture/adr-002-tenant-data-model.md for rationale.

-- ──────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ──────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- provides gen_random_uuid()

-- ──────────────────────────────────────────────────────────────────────────────
-- Tenants
-- Each tenant is an isolated subscriber. All application data belongs to one tenant.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'inactive');

CREATE TABLE tenants (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    -- URL-safe slug used for subdomain routing (e.g. "acme-corp").
    -- Immutable after creation.
    slug        TEXT        NOT NULL UNIQUE,
    status      tenant_status NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants (slug);

-- ──────────────────────────────────────────────────────────────────────────────
-- Organisations
-- A logical grouping of users within a tenant. Initially 1:1 with tenant.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE organisations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organisations_tenant_id ON organisations (tenant_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Tenant Memberships
-- Associates a Descope user (identified by user_id = JWT sub claim) with a tenant.
-- A user may belong to multiple tenants; each membership is independent.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE tenant_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE tenant_memberships (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    -- Descope user ID (sub claim from validated JWT). Not a foreign key —
    -- Descope is the authoritative source of user identity.
    user_id         TEXT        NOT NULL,
    -- Optional: scopes the membership to a specific organisation within the tenant.
    organisation_id UUID        REFERENCES organisations (id) ON DELETE SET NULL,
    role            tenant_role NOT NULL DEFAULT 'member',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One membership per user per tenant.
    UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_tenant_id ON tenant_memberships (tenant_id);
CREATE INDEX idx_tenant_memberships_user_id   ON tenant_memberships (user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Accounts (CRM)
-- A business or company being tracked as a prospect or customer.
-- All queries against this table MUST include a tenant_id filter.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE accounts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    industry    TEXT,
    website     TEXT,
    -- Descope userId of the user who created this record.
    created_by  TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_tenant_id ON accounts (tenant_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Contacts (CRM)
-- An individual person, typically associated with an Account.
-- All queries against this table MUST include a tenant_id filter.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE contacts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    account_id  UUID        REFERENCES accounts (id) ON DELETE SET NULL,
    first_name  TEXT        NOT NULL,
    last_name   TEXT        NOT NULL,
    email       TEXT,
    job_title   TEXT,
    created_by  TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_tenant_id  ON contacts (tenant_id);
CREATE INDEX idx_contacts_account_id ON contacts (account_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Opportunities (CRM)
-- A potential deal or sale, linked to an Account and owned by a team member.
-- All queries against this table MUST include a tenant_id filter.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE opportunity_stage AS ENUM (
    'prospecting',
    'qualification',
    'proposal',
    'negotiation',
    'closed_won',
    'closed_lost'
);

CREATE TABLE opportunities (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID                NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    account_id          UUID                NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
    -- Descope userId of the team member responsible for this opportunity.
    owner_id            TEXT                NOT NULL,
    title               TEXT                NOT NULL,
    stage               opportunity_stage   NOT NULL DEFAULT 'prospecting',
    -- Monetary value; store as NUMERIC to avoid floating-point rounding issues.
    value               NUMERIC(18, 2),
    -- ISO 4217 currency code (e.g. 'GBP', 'USD').
    currency            CHAR(3),
    expected_close_date DATE,
    description         TEXT,
    created_by          TEXT                NOT NULL,
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_tenant_id  ON opportunities (tenant_id);
CREATE INDEX idx_opportunities_account_id ON opportunities (account_id);
CREATE INDEX idx_opportunities_owner_id   ON opportunities (owner_id);
