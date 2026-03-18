-- Migration: 016_object_permissions_and_teams
-- Description: RBAC-related tables — object-level permissions and team
--              structure. Seeds default permissions for every existing
--              object definition.
--
-- Depends on: 006_metadata_schema (object_definitions)
--             009_layout_definitions (layout_fields)

-- ──────────────────────────────────────────────────────────────────────────────
-- Object Permissions
-- Controls which Descope roles can perform which CRUD actions on each object
-- type. One row per (object, role) combination.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS object_permissions (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id   UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE CASCADE,
    role        VARCHAR(50)   NOT NULL,
    can_create  BOOLEAN       NOT NULL DEFAULT false,
    can_read    BOOLEAN       NOT NULL DEFAULT false,
    can_update  BOOLEAN       NOT NULL DEFAULT false,
    can_delete  BOOLEAN       NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, role)
);

CREATE INDEX IF NOT EXISTS idx_object_permissions_object_role ON object_permissions (object_id, role);

-- ──────────────────────────────────────────────────────────────────────────────
-- Teams
-- Groups users together for record-level visibility.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255)  NOT NULL,
    owner_id    VARCHAR(255)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Team Members
-- Associates users with teams. Each user can be a member or manager.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID          NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
    user_id     VARCHAR(255)  NOT NULL,
    role        VARCHAR(50)   NOT NULL DEFAULT 'member',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members (team_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Add visible_to_roles to layout_fields
-- NULL means visible to all roles.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE layout_fields
    ADD COLUMN IF NOT EXISTS visible_to_roles TEXT[] DEFAULT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — default object permissions for every existing object definition
-- For each object:
--   admin     → full CRUD
--   manager   → create, read, update (no delete)
--   user      → create, read, update (no delete)
--   read_only → read only
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO object_permissions (object_id, role, can_create, can_read, can_update, can_delete)
SELECT od.id, r.role, r.can_create, r.can_read, r.can_update, r.can_delete
FROM object_definitions od
CROSS JOIN (
    VALUES
        ('admin',     true,  true,  true,  true),
        ('manager',   true,  true,  true,  false),
        ('user',      true,  true,  true,  false),
        ('read_only', false, true,  false, false)
) AS r(role, can_create, can_read, can_update, can_delete)
ON CONFLICT (object_id, role) DO NOTHING;
