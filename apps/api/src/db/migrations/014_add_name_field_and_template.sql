-- Migration: 014_add_name_field_and_template
-- Description: Adds name_field_id and name_template columns to object_definitions.
--              name_field_id points to the field_definition that should be used as the
--              record's display name. name_template supports compound names like
--              "{first_name} {last_name}" for objects such as Contact and Lead.
--              The API copies the resolved value into records.name automatically,
--              removing the need for a separate "Name" input on create/edit forms.
--
-- Depends on: 006_metadata_schema (object_definitions, field_definitions)

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 1 — Add columns
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE object_definitions
    ADD COLUMN name_field_id UUID REFERENCES field_definitions (id) ON DELETE SET NULL,
    ADD COLUMN name_template VARCHAR(500);

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 2 — Set name_field_id for objects with a single name field
-- ──────────────────────────────────────────────────────────────────────────────

-- Account: name field (api_name = 'name', label = 'Account Name')
UPDATE object_definitions
SET name_field_id = (
    SELECT fd.id FROM field_definitions fd
    WHERE fd.object_id = object_definitions.id AND fd.api_name = 'name'
)
WHERE api_name = 'account';

-- Opportunity: name field (api_name = 'name', label = 'Opportunity Name')
UPDATE object_definitions
SET name_field_id = (
    SELECT fd.id FROM field_definitions fd
    WHERE fd.object_id = object_definitions.id AND fd.api_name = 'name'
)
WHERE api_name = 'opportunity';

-- Activity: subject field
UPDATE object_definitions
SET name_field_id = (
    SELECT fd.id FROM field_definitions fd
    WHERE fd.object_id = object_definitions.id AND fd.api_name = 'subject'
)
WHERE api_name = 'activity';

-- Next Action: title field
UPDATE object_definitions
SET name_field_id = (
    SELECT fd.id FROM field_definitions fd
    WHERE fd.object_id = object_definitions.id AND fd.api_name = 'title'
)
WHERE api_name = 'next_action';

-- Agreement: title field
UPDATE object_definitions
SET name_field_id = (
    SELECT fd.id FROM field_definitions fd
    WHERE fd.object_id = object_definitions.id AND fd.api_name = 'title'
)
WHERE api_name = 'agreement';

-- Note: title field
UPDATE object_definitions
SET name_field_id = (
    SELECT fd.id FROM field_definitions fd
    WHERE fd.object_id = object_definitions.id AND fd.api_name = 'title'
)
WHERE api_name = 'note';

-- File: filename field
UPDATE object_definitions
SET name_field_id = (
    SELECT fd.id FROM field_definitions fd
    WHERE fd.object_id = object_definitions.id AND fd.api_name = 'filename'
)
WHERE api_name = 'file';

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 3 — Set name_template for objects with compound names
-- ──────────────────────────────────────────────────────────────────────────────

UPDATE object_definitions
SET name_template = '{first_name} {last_name}'
WHERE api_name IN ('contact', 'lead');
