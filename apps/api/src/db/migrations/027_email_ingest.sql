-- Migration: 027_email_ingest
-- Description: Tables supporting the Copilot-style email-to-CRM agent.
--
--   * mailbox_connections    – one row per user that has connected a mailbox
--                              (Microsoft Graph today; Gmail later). Stores
--                              encrypted OAuth tokens and connection status.
--
--   * mailbox_subscriptions  – one row per Graph change-notification
--                              subscription we have open against a mailbox.
--                              Subscriptions expire (Outlook messages: ~3d)
--                              and are renewed by the background job.
--
--   * email_ingest           – one row per email we have ingested (or skipped
--                              during filtering). Carries the raw payload for
--                              audit, the LLM extraction, the match decision,
--                              and the resulting Account / Activity ids.
--
-- Idempotency: (tenant_id, provider, provider_msg_id) is unique on email_ingest
-- so redelivered webhooks are no-ops.
--
-- Row-Level Security: mirrors the tenant_isolation / tenant_isolation_bypass
-- policies installed by migration 025. We reuse the _enable_tenant_rls()
-- helper from that migration so policy shape stays consistent.
--
-- Depends on: 025_enable_row_level_security (RLS helper function),
--             017_add_tenant_id_to_all_tables (tenant_id shape = VARCHAR(255))

-- ──────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ──────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- similarity() for name matching

-- ──────────────────────────────────────────────────────────────────────────────
-- mailbox_connections
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mailbox_connections (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          VARCHAR(255)  NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id            TEXT          NOT NULL,                  -- Descope userId
    provider           TEXT          NOT NULL,                  -- 'microsoft'
    provider_user_id   TEXT          NOT NULL,                  -- Graph user id ('sub' or 'oid')
    email_address      TEXT          NOT NULL,
    access_token_enc   BYTEA,                                   -- AES-256-GCM (iv || tag || ct)
    refresh_token_enc  BYTEA         NOT NULL,
    token_expires_at   TIMESTAMPTZ,
    scopes             TEXT[]        NOT NULL,
    status             TEXT          NOT NULL DEFAULT 'active', -- active|paused|revoked|error
    last_error         TEXT,
    connected_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_mailbox_connections_tenant_user
    ON mailbox_connections (tenant_id, user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- mailbox_subscriptions
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mailbox_subscriptions (
    id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_connection_id     UUID          NOT NULL REFERENCES mailbox_connections (id) ON DELETE CASCADE,
    tenant_id                 VARCHAR(255)  NOT NULL,
    provider                  TEXT          NOT NULL,
    provider_subscription_id  TEXT          NOT NULL,
    resource                  TEXT          NOT NULL,
    client_state              TEXT          NOT NULL,           -- validated on every notification
    expires_at                TIMESTAMPTZ   NOT NULL,
    delta_link                TEXT,                             -- most recent deltaLink for recovery
    created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_mailbox_subscriptions_expires_at
    ON mailbox_subscriptions (expires_at);
CREATE INDEX IF NOT EXISTS idx_mailbox_subscriptions_tenant
    ON mailbox_subscriptions (tenant_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- email_ingest
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_ingest (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        VARCHAR(255)  NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id          TEXT          NOT NULL,                    -- mailbox owner (Descope userId)
    received_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    provider         TEXT          NOT NULL,                    -- 'microsoft' | 'postmark'
    provider_msg_id  TEXT          NOT NULL,                    -- internetMessageId / MessageID
    from_email       TEXT,
    from_name        TEXT,
    to_emails        TEXT[],
    cc_emails        TEXT[],
    subject          TEXT,
    text_body        TEXT,
    html_body        TEXT,
    conversation_id  TEXT,
    filter_decision  TEXT          NOT NULL,                    -- processed|skipped_internal|skipped_bulk|skipped_automated|manual
    llm_extraction   JSONB,
    status           TEXT          NOT NULL,                    -- auto_applied|new_account|pending_user_review|resolved|failed|skipped
    error            TEXT,
    account_id       UUID,
    activity_id      UUID,
    review_task_id   UUID,
    confidence       NUMERIC(4,3),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, provider, provider_msg_id)
);

CREATE INDEX IF NOT EXISTS idx_email_ingest_tenant_user_status
    ON email_ingest (tenant_id, user_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_ingest_tenant_account
    ON email_ingest (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_email_ingest_conversation
    ON email_ingest (tenant_id, conversation_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Row-Level Security — reuses the helper from migration 025
-- ──────────────────────────────────────────────────────────────────────────────

SELECT _enable_tenant_rls('mailbox_connections');
SELECT _enable_tenant_rls('mailbox_subscriptions');
SELECT _enable_tenant_rls('email_ingest');
