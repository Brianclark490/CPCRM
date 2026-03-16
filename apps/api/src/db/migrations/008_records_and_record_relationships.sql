-- Migration: 008_records_and_record_relationships
-- Description: Universal records table and record relationships.
--              All CRM object data lives in the records table with a JSONB
--              field_values column. Record relationships link records together
--              using the relationship definitions from migration 007.
--
--              Also migrates existing accounts and opportunities data into the
--              new records table, and creates record_relationships for any
--              opportunity→account links.
--
-- Depends on: 006_metadata_schema (object_definitions)
--             007_relationship_definitions (relationship_definitions)

-- ──────────────────────────────────────────────────────────────────────────────
-- Records
-- Universal data store for all CRM object instances. Each row represents a
-- single record (e.g. one account, one opportunity, one custom object instance).
-- The object_id column links back to object_definitions to identify the type.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS records (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id     UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE RESTRICT,
    name          VARCHAR(500)  NOT NULL,
    field_values  JSONB         NOT NULL DEFAULT '{}',
    owner_id      VARCHAR(255)  NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_records_object_id       ON records (object_id);
CREATE INDEX IF NOT EXISTS idx_records_owner_id        ON records (owner_id);
CREATE INDEX IF NOT EXISTS idx_records_object_owner    ON records (object_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_records_name            ON records (name);
CREATE INDEX IF NOT EXISTS idx_records_field_values    ON records USING GIN (field_values);

-- ──────────────────────────────────────────────────────────────────────────────
-- Record Relationships
-- Links two records together via a relationship definition.
-- For example, an opportunity record → account record via the
-- "opportunity_account" relationship.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS record_relationships (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    relationship_id   UUID        NOT NULL REFERENCES relationship_definitions (id) ON DELETE CASCADE,
    source_record_id  UUID        NOT NULL REFERENCES records (id) ON DELETE CASCADE,
    target_record_id  UUID        NOT NULL REFERENCES records (id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (relationship_id, source_record_id, target_record_id)
);

CREATE INDEX IF NOT EXISTS idx_record_relationships_source_record_id  ON record_relationships (source_record_id);
CREATE INDEX IF NOT EXISTS idx_record_relationships_target_record_id  ON record_relationships (target_record_id);
CREATE INDEX IF NOT EXISTS idx_record_relationships_relationship_id   ON record_relationships (relationship_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Data migration — accounts → records
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO records (object_id, name, field_values, owner_id, created_at, updated_at)
SELECT
    (SELECT id FROM object_definitions WHERE api_name = 'account'),
    a.name,
    jsonb_build_object(
        'industry',      a.industry,
        'website',       a.website,
        'phone',         a.phone,
        'email',         a.email,
        'address_line1', a.address_line1,
        'address_line2', a.address_line2,
        'city',          a.city,
        'region',        a.region,
        'postal_code',   a.postal_code,
        'country',       a.country,
        'notes',         a.notes
    ),
    a.owner_id,
    a.created_at,
    a.updated_at
FROM accounts a;

-- ──────────────────────────────────────────────────────────────────────────────
-- Data migration — opportunities → records
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO records (object_id, name, field_values, owner_id, created_at, updated_at)
SELECT
    (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
    o.title,
    jsonb_build_object(
        'stage',               o.stage::text,
        'value',               o.value,
        'currency',            o.currency,
        'expected_close_date', o.expected_close_date,
        'description',         o.description,
        'stage_history',       o.stage_history
    ),
    o.owner_id,
    o.created_at,
    o.updated_at
FROM opportunities o;

-- ──────────────────────────────────────────────────────────────────────────────
-- Data migration — opportunity→account links → record_relationships
-- For each opportunity that has an account_id, create a record_relationship
-- linking the opportunity record to the account record via the
-- "opportunity_account" relationship definition.
--
-- This uses a name-based join to match old account rows to their new records
-- counterparts (since both share the same name and object_id).
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO record_relationships (relationship_id, source_record_id, target_record_id, created_at)
SELECT
    (SELECT id FROM relationship_definitions WHERE api_name = 'opportunity_account'),
    opp_rec.id,
    acct_rec.id,
    o.created_at
FROM opportunities o
JOIN accounts a ON a.id = o.account_id
JOIN records opp_rec
    ON opp_rec.object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
   AND opp_rec.name = o.title
   AND opp_rec.created_at = o.created_at
JOIN records acct_rec
    ON acct_rec.object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
   AND acct_rec.name = a.name
   AND acct_rec.created_at = a.created_at
WHERE o.account_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- Deprecation comments on old tables
-- Keep them around for verification; safe to drop in a future migration.
-- ──────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE accounts IS 'DEPRECATED: Data migrated to records table in migration 008. Safe to drop after verification.';
COMMENT ON TABLE opportunities IS 'DEPRECATED: Data migrated to records table in migration 008. Safe to drop after verification.';
