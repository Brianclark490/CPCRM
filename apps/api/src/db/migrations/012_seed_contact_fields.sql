-- Migration: 012_seed_contact_fields
-- Description: Seeds field definitions, relationship, and default layouts for
--              the Contact object. The Contact object definition was already
--              created in 011_seed_default_object_definitions.
--
--              The record "name" column for contacts should be set to
--              "{first_name} {last_name}" — the API must concatenate these
--              when creating or updating a contact record.
--
-- Depends on: 006_metadata_schema (object_definitions, field_definitions)
--             007_relationship_definitions (relationship_definitions)
--             009_layout_definitions (layout_definitions, layout_fields)
--             011_seed_default_object_definitions (contact object)

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — contact field definitions (12 fields)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'first_name',      'First Name',      'text',     true,  '{"max_length": 100}', 1,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'last_name',       'Last Name',       'text',     true,  '{"max_length": 100}', 2,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'email',           'Email',           'email',    false, '{}',                  3,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'phone',           'Phone',           'phone',    false, '{}',                  4,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'mobile',          'Mobile',          'phone',    false, '{}',                  5,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'job_title',       'Job Title',       'text',     false, '{"max_length": 200}', 6,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'department',      'Department',      'text',     false, '{"max_length": 200}', 7,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'status',          'Status',          'dropdown', false, '{"choices": ["Active", "Inactive", "Do Not Contact"]}', 8, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'linkedin_url',    'LinkedIn',        'url',      false, '{}',                  9,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'mailing_address', 'Mailing Address', 'textarea', false, '{}',                  10, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'date_of_birth',   'Date of Birth',   'date',     false, '{}',                  11, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'description',     'Notes',           'textarea', false, '{}',                  12, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — contact → account lookup relationship
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM relationship_definitions
    WHERE source_object_id = (SELECT id FROM object_definitions WHERE api_name = 'contact')
      AND api_name = 'contact_account'
  ) THEN
    INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required)
    VALUES (
      (SELECT id FROM object_definitions WHERE api_name = 'contact'),
      (SELECT id FROM object_definitions WHERE api_name = 'account'),
      'lookup',
      'contact_account',
      'Account',
      'Contacts',
      false
    );
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — default layouts for the Contact object
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_definitions (object_id, name, layout_type, is_default)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'contact'), 'List View',    'list', true)
ON CONFLICT (object_id, name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Contact "Default Form" layout fields
-- All 12 contact fields, grouped into logical sections.
--   Section 0: Personal   — first_name (half), last_name (half), email, phone (half), mobile (half)
--   Section 1: Professional — job_title, department, linkedin_url
--   Section 2: Other       — status, date_of_birth, mailing_address, description
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    -- Section 0: Personal
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'first_name'),
        0, 'Personal', 1, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'last_name'),
        0, 'Personal', 2, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'email'),
        0, 'Personal', 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'phone'),
        0, 'Personal', 4, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'mobile'),
        0, 'Personal', 5, 'half'
    ),
    -- Section 1: Professional
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'job_title'),
        1, 'Professional', 6, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'department'),
        1, 'Professional', 7, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'linkedin_url'),
        1, 'Professional', 8, 'full'
    ),
    -- Section 2: Other
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'status'),
        2, 'Other', 9, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'date_of_birth'),
        2, 'Other', 10, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'mailing_address'),
        2, 'Other', 11, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'description'),
        2, 'Other', 12, 'full'
    );

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Contact "List View" layout fields
-- Columns: first_name, last_name, email, phone, job_title, status (6 columns)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'first_name'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'last_name'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'email'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'phone'),
        0, NULL, 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'job_title'),
        0, NULL, 5, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'contact' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'contact' AND fd.api_name = 'status'),
        0, NULL, 6, 'full'
    );
