-- Migration: 007_relationship_definitions
-- Description: Relationship definitions between objects. Describes how CRM
--              objects relate to each other (e.g. opportunity → account lookup).
--              Seeds the built-in opportunity→account relationship.
--
-- Depends on: 006_metadata_schema (object_definitions table)

-- ──────────────────────────────────────────────────────────────────────────────
-- Relationship Definitions
-- Each row describes a relationship between two object types.
-- relationship_type is one of: 'lookup', 'parent_child'.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS relationship_definitions (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    source_object_id   UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE CASCADE,
    target_object_id   UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE CASCADE,
    relationship_type  VARCHAR(50)   NOT NULL,
    api_name           VARCHAR(100)  NOT NULL,
    label              VARCHAR(255)  NOT NULL,
    reverse_label      VARCHAR(255),
    required           BOOLEAN       NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (source_object_id, api_name)
);

CREATE INDEX IF NOT EXISTS idx_relationship_definitions_source_object_id ON relationship_definitions (source_object_id);
CREATE INDEX IF NOT EXISTS idx_relationship_definitions_target_object_id ON relationship_definitions (target_object_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — opportunity → account lookup relationship
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM relationship_definitions
    WHERE source_object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
      AND api_name = 'opportunity_account'
  ) THEN
    INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label)
    VALUES (
      (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
      (SELECT id FROM object_definitions WHERE api_name = 'account'),
      'lookup',
      'opportunity_account',
      'Account',
      'Opportunities'
    );
  END IF;
END $$;
