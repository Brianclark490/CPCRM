-- Migration: 012_seed_opportunity_fields
-- Description: Seeds the full set of 10 field definitions for the Opportunity
--              object, adds the Opportunity → Contact relationship, and rebuilds
--              the default form and list layouts with the updated field set.
--
--              Replaces the 6 original opportunity fields (seeded in
--              006_metadata_schema) with the canonical 10-field definition from
--              Issue 1.5.
--
-- Depends on: 006_metadata_schema (object_definitions, field_definitions)
--             007_relationship_definitions (relationship_definitions)
--             009_layout_definitions (layout_definitions, layout_fields)
--             011_seed_default_object_definitions (contact object)

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 1: Remove existing Opportunity layout_fields so we can safely modify
--         the underlying field_definitions without FK conflicts.
-- ──────────────────────────────────────────────────────────────────────────────

DELETE FROM layout_fields
WHERE layout_id IN (
    SELECT ld.id
    FROM layout_definitions ld
    JOIN object_definitions od ON ld.object_id = od.id
    WHERE od.api_name = 'opportunity'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 2: Update existing field definitions
-- ──────────────────────────────────────────────────────────────────────────────

-- 2a. Rename title → name
UPDATE field_definitions
SET api_name   = 'name',
    label      = 'Opportunity Name',
    options    = '{"max_length": 255}',
    sort_order = 1,
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
  AND api_name = 'title';

-- 2b. Update stage choices (title-case, add "Needs Analysis")
UPDATE field_definitions
SET options    = '{"choices": ["Prospecting", "Qualification", "Needs Analysis", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]}',
    sort_order = 2,
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
  AND api_name = 'stage';

-- 2c. Ensure value field sort_order and options are correct
UPDATE field_definitions
SET options    = '{"min": 0, "precision": 2}',
    sort_order = 3,
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
  AND api_name = 'value';

-- 2d. Rename expected_close_date → close_date
UPDATE field_definitions
SET api_name   = 'close_date',
    label      = 'Close Date',
    sort_order = 4,
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
  AND api_name = 'expected_close_date';

-- 2e. Update description sort_order from 6 → 9
UPDATE field_definitions
SET sort_order = 9,
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
  AND api_name = 'description';

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 3: Remove the deprecated currency field definition
-- ──────────────────────────────────────────────────────────────────────────────

DELETE FROM field_definitions
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
  AND api_name = 'currency';

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 4: Insert new field definitions
--         Uses ON CONFLICT to be idempotent if re-run.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'probability', 'Probability (%)', 'number',   false, '{"min": 0, "max": 100}', 5,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'source',      'Source',          'dropdown', false, '{"choices": ["Website", "Referral", "Cold Call", "Email Campaign", "Social Media", "Event", "Advertisement", "Partner", "Inbound Lead", "Other"]}', 6, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'type',        'Type',            'dropdown', false, '{"choices": ["New Business", "Existing Business", "Renewal", "Upsell"]}', 7, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'next_step',   'Next Step',       'text',     false, '{"max_length": 500}', 8,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'lost_reason', 'Lost Reason',     'dropdown', false, '{"choices": ["Price", "Competitor", "No Budget", "No Decision", "Timing", "Feature Gap", "Other"]}', 10, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 5: Seed Opportunity → Contact relationship
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM relationship_definitions
    WHERE source_object_id = (SELECT id FROM object_definitions WHERE api_name = 'opportunity')
      AND api_name = 'opportunity_contact'
  ) THEN
    INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required)
    VALUES (
      (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
      (SELECT id FROM object_definitions WHERE api_name = 'contact'),
      'lookup',
      'opportunity_contact',
      'Primary Contact',
      'Opportunities',
      false
    );
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 6: Rebuild Opportunity "Default Form" layout fields
--
-- Section 0 "Deal Info": name, stage, value (half), probability (half),
--                        close_date (half), type (half)
-- Section 1 "Source":    source, next_step
-- Section 2 "Details":   description, lost_reason
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    -- Section 0: Deal Info
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'name'),
        0, 'Deal Info', 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'stage'),
        0, 'Deal Info', 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'value'),
        0, 'Deal Info', 3, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'probability'),
        0, 'Deal Info', 4, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'close_date'),
        0, 'Deal Info', 5, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'type'),
        0, 'Deal Info', 6, 'half'
    ),
    -- Section 1: Source
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'source'),
        1, 'Source', 7, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'next_step'),
        1, 'Source', 8, 'full'
    ),
    -- Section 2: Details
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'description'),
        2, 'Details', 9, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'lost_reason'),
        2, 'Details', 10, 'full'
    );

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 7: Rebuild Opportunity "List View" layout fields
-- Columns: name, stage, value, close_date, probability, source
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'name'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'stage'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'value'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'close_date'),
        0, NULL, 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'probability'),
        0, NULL, 5, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'source'),
        0, NULL, 6, 'full'
    );
