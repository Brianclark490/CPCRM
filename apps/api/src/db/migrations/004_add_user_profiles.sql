-- Migration: 004_add_user_profiles
-- Description: User profile records linked to Descope identities.
--              One profile per Descope user ID; stores optional display name and job title.

-- ──────────────────────────────────────────────────────────────────────────────
-- User Profiles
-- Associates application-level profile data with a Descope user identity.
-- The user_id column mirrors the JWT `sub` claim and is the unique identity key.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE user_profiles (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Descope user ID (sub claim from validated JWT). Not a foreign key —
    -- Descope is the authoritative source of user identity.
    user_id         TEXT        NOT NULL UNIQUE,
    -- Optional display name the user has set within CPCRM.
    display_name    TEXT,
    -- Optional job title.
    job_title       TEXT,
    -- Descope userId of the user who last updated this profile.
    updated_by      TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles (user_id);
