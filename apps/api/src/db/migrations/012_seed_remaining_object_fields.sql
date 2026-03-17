-- Migration: 012_seed_remaining_object_fields
-- Description: Seeds field definitions, relationship definitions, and layout
--              definitions (form + list) for the remaining 5 system objects:
--              Activity, Next Action, Agreement, Note, File.
--
--              Object definitions already exist (seeded by 011_seed_default_object_definitions).
--              All inserts use ON CONFLICT DO NOTHING to ensure idempotency.
--
-- Depends on: 006_metadata_schema (field_definitions table)
--             007_relationship_definitions (relationship_definitions table)
--             009_layout_definitions (layout_definitions, layout_fields tables)
--             011_seed_default_object_definitions (object_definitions rows)

-- ══════════════════════════════════════════════════════════════════════════════
-- FIELD DEFINITIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────
-- Activity fields (9 fields)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'subject',          'Subject',          'text',     true,  '{"max_length": 500}', 1, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'type',             'Type',             'dropdown', true,  '{"choices": ["Call", "Email", "Meeting", "Task", "Demo", "Follow-up", "Other"]}', 2, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'status',           'Status',           'dropdown', true,  '{"choices": ["Not Started", "In Progress", "Completed", "Deferred", "Cancelled"]}', 3, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'priority',         'Priority',         'dropdown', false, '{"choices": ["High", "Medium", "Low"]}', 4, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'due_date',         'Due Date',         'datetime', false, '{}', 5, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'completed_date',   'Completed Date',   'datetime', false, '{}', 6, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'duration_minutes', 'Duration (mins)',  'number',   false, '{"min": 0}', 7, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'description',      'Description',      'textarea', false, '{}', 8, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'), 'outcome',          'Outcome',          'textarea', false, '{}', 9, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Next Action fields (6 fields)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'title',       'Title',       'text',     true,  '{"max_length": 500}', 1, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'due_date',    'Due Date',    'date',     true,  '{}', 2, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'priority',    'Priority',    'dropdown', false, '{"choices": ["High", "Medium", "Low"]}', 3, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'status',      'Status',      'dropdown', true,  '{"choices": ["Pending", "In Progress", "Completed", "Skipped"]}', 4, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'assigned_to', 'Assigned To', 'text',     false, '{"max_length": 255}', 5, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'description', 'Description', 'textarea', false, '{}', 6, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Agreement fields (9 fields)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'title',        'Title',              'text',     true,  '{"max_length": 500}', 1, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'type',         'Type',               'dropdown', false, '{"choices": ["Contract", "Proposal", "Quote", "SLA", "NDA", "SOW", "Other"]}', 2, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'status',       'Status',             'dropdown', true,  '{"choices": ["Draft", "Sent", "Under Review", "Signed", "Expired", "Cancelled"]}', 3, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'start_date',   'Start Date',         'date',     false, '{}', 4, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'end_date',     'End Date',           'date',     false, '{}', 5, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'value',        'Value',              'currency', false, '{"min": 0, "precision": 2}', 6, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'renewal_date', 'Renewal Date',       'date',     false, '{}', 7, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'terms',        'Terms & Conditions', 'textarea', false, '{}', 8, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'), 'description',  'Description',        'textarea', false, '{}', 9, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Note fields (3 fields)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'note'), 'title',    'Title',    'text',     true,  '{"max_length": 500}', 1, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'note'), 'body',     'Body',     'textarea', true,  '{}', 2, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'note'), 'category', 'Category', 'dropdown', false, '{"choices": ["General", "Meeting Notes", "Phone Call", "Decision", "Action Item", "Important"]}', 3, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- File fields (5 fields)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'file'), 'filename',    'Filename',       'text',     true,  '{"max_length": 500}', 1, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'file'), 'file_url',    'File URL',       'url',      true,  '{}', 2, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'file'), 'category',    'Category',       'dropdown', false, '{"choices": ["Document", "Spreadsheet", "Presentation", "Image", "Contract", "Proposal", "Invoice", "Other"]}', 3, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'file'), 'file_size',   'File Size (KB)', 'number',   false, '{"min": 0}', 4, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'file'), 'description', 'Description',    'textarea', false, '{}', 5, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- RELATIONSHIP DEFINITIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────
-- Activity relationships
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required)
VALUES
    (
        (SELECT id FROM object_definitions WHERE api_name = 'activity'),
        (SELECT id FROM object_definitions WHERE api_name = 'account'),
        'lookup', 'activity_account', 'Account', 'Activities', false
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'activity'),
        (SELECT id FROM object_definitions WHERE api_name = 'contact'),
        'lookup', 'activity_contact', 'Contact', 'Activities', false
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'activity'),
        (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
        'lookup', 'activity_opportunity', 'Opportunity', 'Activities', false
    )
ON CONFLICT (source_object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Next Action relationships
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required)
VALUES
    (
        (SELECT id FROM object_definitions WHERE api_name = 'next_action'),
        (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
        'lookup', 'next_action_opportunity', 'Opportunity', 'Next Actions', true
    )
ON CONFLICT (source_object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Agreement relationships
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required)
VALUES
    (
        (SELECT id FROM object_definitions WHERE api_name = 'agreement'),
        (SELECT id FROM object_definitions WHERE api_name = 'account'),
        'lookup', 'agreement_account', 'Account', 'Agreements', true
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'agreement'),
        (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
        'lookup', 'agreement_opportunity', 'Opportunity', 'Agreements', false
    )
ON CONFLICT (source_object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Note relationships
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required)
VALUES
    (
        (SELECT id FROM object_definitions WHERE api_name = 'note'),
        (SELECT id FROM object_definitions WHERE api_name = 'account'),
        'lookup', 'note_account', 'Account', 'Notes', false
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'note'),
        (SELECT id FROM object_definitions WHERE api_name = 'contact'),
        'lookup', 'note_contact', 'Contact', 'Notes', false
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'note'),
        (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
        'lookup', 'note_opportunity', 'Opportunity', 'Notes', false
    )
ON CONFLICT (source_object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- File relationships
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO relationship_definitions (source_object_id, target_object_id, relationship_type, api_name, label, reverse_label, required)
VALUES
    (
        (SELECT id FROM object_definitions WHERE api_name = 'file'),
        (SELECT id FROM object_definitions WHERE api_name = 'account'),
        'lookup', 'file_account', 'Account', 'Files', false
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'file'),
        (SELECT id FROM object_definitions WHERE api_name = 'contact'),
        'lookup', 'file_contact', 'Contact', 'Files', false
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'file'),
        (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
        'lookup', 'file_opportunity', 'Opportunity', 'Files', false
    ),
    (
        (SELECT id FROM object_definitions WHERE api_name = 'file'),
        (SELECT id FROM object_definitions WHERE api_name = 'agreement'),
        'lookup', 'file_agreement', 'Agreement', 'Files', false
    )
ON CONFLICT (source_object_id, api_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- LAYOUT DEFINITIONS
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO layout_definitions (object_id, name, layout_type, is_default)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'),    'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'activity'),    'List View',    'list', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'next_action'), 'List View',    'list', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'),   'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'agreement'),   'List View',    'list', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'note'),        'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'note'),        'List View',    'list', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'file'),        'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'file'),        'List View',    'list', true)
ON CONFLICT (object_id, name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- LAYOUT FIELDS — FORM LAYOUTS
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────
-- Activity "Default Form"
--   Section 0 "Details": subject, type (half), status (half), priority (half),
--                        due_date (half), completed_date (half), duration_minutes (half)
--   Section 1 "Notes":   description, outcome
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'subject'),
        0, 'Details', 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'type'),
        0, 'Details', 2, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'status'),
        0, 'Details', 3, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'priority'),
        0, 'Details', 4, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'due_date'),
        0, 'Details', 5, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'completed_date'),
        0, 'Details', 6, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'duration_minutes'),
        0, 'Details', 7, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'description'),
        1, 'Notes', 8, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'outcome'),
        1, 'Notes', 9, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Next Action "Default Form"
--   Section 0: title, due_date (half), priority (half), status (half),
--              assigned_to (half), description
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'title'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'due_date'),
        0, NULL, 2, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'priority'),
        0, NULL, 3, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'status'),
        0, NULL, 4, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'assigned_to'),
        0, NULL, 5, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'description'),
        0, NULL, 6, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Agreement "Default Form"
--   Section 0 "Agreement details": title, type (half), status (half), value
--   Section 1 "Dates":            start_date (half), end_date (half), renewal_date
--   Section 2 "Terms":            terms, description
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'title'),
        0, 'Agreement details', 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'type'),
        0, 'Agreement details', 2, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'status'),
        0, 'Agreement details', 3, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'value'),
        0, 'Agreement details', 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'start_date'),
        1, 'Dates', 5, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'end_date'),
        1, 'Dates', 6, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'renewal_date'),
        1, 'Dates', 7, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'terms'),
        2, 'Terms', 8, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'description'),
        2, 'Terms', 9, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Note "Default Form"
--   Section 0: title, category, body
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'note' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'note' AND fd.api_name = 'title'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'note' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'note' AND fd.api_name = 'category'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'note' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'note' AND fd.api_name = 'body'),
        0, NULL, 3, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- File "Default Form"
--   Section 0: filename, file_url, category (half), file_size (half), description
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'filename'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'file_url'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'category'),
        0, NULL, 3, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'file_size'),
        0, NULL, 4, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'description'),
        0, NULL, 5, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- LAYOUT FIELDS — LIST LAYOUTS
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────
-- Activity "List View": subject, type, status, priority, due_date
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'subject'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'type'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'status'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'priority'),
        0, NULL, 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'activity' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'activity' AND fd.api_name = 'due_date'),
        0, NULL, 5, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Next Action "List View": title, due_date, priority, status
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'title'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'due_date'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'priority'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'next_action' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'next_action' AND fd.api_name = 'status'),
        0, NULL, 4, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Agreement "List View": title, type, status, start_date, end_date, value
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'title'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'type'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'status'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'start_date'),
        0, NULL, 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'end_date'),
        0, NULL, 5, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'agreement' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'agreement' AND fd.api_name = 'value'),
        0, NULL, 6, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Note "List View": title, category
-- (created_at is a built-in record column rendered by the UI automatically)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'note' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'note' AND fd.api_name = 'title'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'note' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'note' AND fd.api_name = 'category'),
        0, NULL, 2, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- File "List View": filename, category, file_size
-- (created_at is a built-in record column rendered by the UI automatically)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'filename'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'category'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'file' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'file' AND fd.api_name = 'file_size'),
        0, NULL, 3, 'full'
    )
ON CONFLICT (layout_id, field_id) DO NOTHING;
