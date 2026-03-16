-- Migration: 009_layout_definitions
-- Description: Layout definitions that control which fields appear on forms
--              and list views. Seeds default layouts for the system objects
--              (account, opportunity).
--
-- Depends on: 006_metadata_schema (object_definitions, field_definitions)

-- ──────────────────────────────────────────────────────────────────────────────
-- Layout Definitions
-- Each row describes a named layout for a CRM object (e.g. "Default Form",
-- "List View"). The layout_type determines the context: form, list, or detail.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS layout_definitions (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id     UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE CASCADE,
    name          VARCHAR(255)  NOT NULL,
    layout_type   VARCHAR(50)   NOT NULL,
    is_default    BOOLEAN       NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, name)
);

CREATE INDEX IF NOT EXISTS idx_layout_definitions_object_id   ON layout_definitions (object_id);
CREATE INDEX IF NOT EXISTS idx_layout_definitions_layout_type ON layout_definitions (layout_type);

-- ──────────────────────────────────────────────────────────────────────────────
-- Layout Fields
-- Each row places a field definition into a layout, with optional section
-- grouping, sort order, and width hints for the UI renderer.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS layout_fields (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id     UUID          NOT NULL REFERENCES layout_definitions (id) ON DELETE CASCADE,
    field_id      UUID          NOT NULL REFERENCES field_definitions (id) ON DELETE CASCADE,
    section       INTEGER       NOT NULL DEFAULT 0,
    section_label VARCHAR(255),
    sort_order    INTEGER       NOT NULL DEFAULT 0,
    width         VARCHAR(20)   DEFAULT 'full',
    UNIQUE (layout_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_layout_fields_layout_id ON layout_fields (layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_fields_field_id  ON layout_fields (field_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — default layouts for system objects
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_definitions (object_id, name, layout_type, is_default)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'account'),     'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'),     'List View',    'list', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'List View',    'list', true);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Account "Default Form" layout fields
-- All 12 account fields, grouped into logical sections.
--   Section 0: Basic Information
--   Section 1: Contact Details
--   Section 2: Address
--   Section 3: Other
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    -- Section 0: Basic Information
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'name'),
        0, 'Basic Information', 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'industry'),
        0, 'Basic Information', 2, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'website'),
        0, 'Basic Information', 3, 'half'
    ),
    -- Section 1: Contact Details
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'phone'),
        1, 'Contact Details', 4, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'email'),
        1, 'Contact Details', 5, 'half'
    ),
    -- Section 2: Address
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'address_line1'),
        2, 'Address', 6, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'address_line2'),
        2, 'Address', 7, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'city'),
        2, 'Address', 8, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'region'),
        2, 'Address', 9, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'postal_code'),
        2, 'Address', 10, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'country'),
        2, 'Address', 11, 'half'
    ),
    -- Section 3: Other
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'notes'),
        3, 'Other', 12, 'full'
    );

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Account "List View" layout fields
-- Key columns: name, industry, email, phone, website (5 columns)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'name'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'industry'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'email'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'phone'),
        0, NULL, 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'website'),
        0, NULL, 5, 'full'
    );

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Opportunity "Default Form" layout fields
-- All 6 opportunity fields, grouped into logical sections.
--   Section 0: Deal Information
--   Section 1: Timeline
--   Section 2: Details
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    -- Section 0: Deal Information
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'title'),
        0, 'Deal Information', 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'stage'),
        0, 'Deal Information', 2, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'value'),
        0, 'Deal Information', 3, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'currency'),
        0, 'Deal Information', 4, 'half'
    ),
    -- Section 1: Timeline
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'expected_close_date'),
        1, 'Timeline', 5, 'half'
    ),
    -- Section 2: Details
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'description'),
        2, 'Details', 6, 'full'
    );

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Opportunity "List View" layout fields
-- Key columns: title, stage, value, expected_close_date (4 columns)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'opportunity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'title'),
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
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'opportunity' AND fd.api_name = 'expected_close_date'),
        0, NULL, 4, 'full'
    );
