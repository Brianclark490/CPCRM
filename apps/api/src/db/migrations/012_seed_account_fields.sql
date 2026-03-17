-- Migration: 012_seed_account_fields
-- Description: Seeds the full set of 16 Account field definitions and updates
--              the default form and list layouts as specified in Issue 1.2.
--
-- Depends on: 006_metadata_schema, 009_layout_definitions

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 1 — Update existing Account field definitions
-- ──────────────────────────────────────────────────────────────────────────────

-- name: label → "Account Name", max_length → 255
UPDATE field_definitions
SET label      = 'Account Name',
    options    = '{"max_length": 255}'::jsonb,
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'name';

-- industry: text → dropdown with choices, sort_order 2 → 3
UPDATE field_definitions
SET field_type  = 'dropdown',
    options     = '{"choices": ["Technology","Healthcare","Finance","Manufacturing","Retail","Education","Real Estate","Professional Services","Non-Profit","Government","Other"]}'::jsonb,
    sort_order  = 3,
    updated_at  = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'industry';

-- website: sort_order 3 → 5
UPDATE field_definitions
SET sort_order = 5, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'website';

-- phone: sort_order 4 → 6
UPDATE field_definitions
SET sort_order = 6, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'phone';

-- email: sort_order 5 → 7
UPDATE field_definitions
SET sort_order = 7, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'email';

-- address_line1: sort_order 6 → 8
UPDATE field_definitions
SET sort_order = 8, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'address_line1';

-- address_line2: sort_order 7 → 9
UPDATE field_definitions
SET sort_order = 9, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'address_line2';

-- city: sort_order 8 → 10
UPDATE field_definitions
SET sort_order = 10, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'city';

-- region: sort_order 9 → 11
UPDATE field_definitions
SET sort_order = 11, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'region';

-- postal_code: sort_order 10 → 12
UPDATE field_definitions
SET sort_order = 12, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'postal_code';

-- country: sort_order 11 → 13
UPDATE field_definitions
SET sort_order = 13, updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'country';

-- notes → description: rename api_name and label, set sort_order to 16
UPDATE field_definitions
SET api_name   = 'description',
    label      = 'Description',
    description = NULL,
    sort_order = 16,
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND api_name  = 'notes';

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 2 — Insert new Account field definitions
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'account'),
     'type', 'Type', 'dropdown', false,
     '{"choices": ["Prospect","Customer","Partner","Vendor","Other"]}'::jsonb,
     2, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'),
     'status', 'Status', 'dropdown', false,
     '{"choices": ["Active","Inactive","Churned"]}'::jsonb,
     4, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'),
     'annual_revenue', 'Annual Revenue', 'currency', false,
     '{"min": 0, "precision": 2}'::jsonb,
     14, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'),
     'employee_count', 'Employees', 'number', false,
     '{"min": 0}'::jsonb,
     15, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- Ensure description exists even if the notes → description rename above was a
-- no-op (e.g. notes row was already removed in a prior run).
INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'account'),
     'description', 'Description', 'textarea', false, '{}'::jsonb, 16, true)
ON CONFLICT (object_id, api_name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 3 — Update Account layout definition names
-- ──────────────────────────────────────────────────────────────────────────────

UPDATE layout_definitions
SET name       = 'Default form',
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND name      = 'Default Form';

UPDATE layout_definitions
SET name       = 'Default list',
    updated_at = NOW()
WHERE object_id = (SELECT id FROM object_definitions WHERE api_name = 'account')
  AND name      = 'List View';

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 4 — Replace Account form layout fields
-- ──────────────────────────────────────────────────────────────────────────────

-- Remove old form layout fields
DELETE FROM layout_fields
WHERE layout_id = (
    SELECT ld.id
    FROM layout_definitions ld
    JOIN object_definitions od ON ld.object_id = od.id
    WHERE od.api_name = 'account' AND ld.name = 'Default form'
);

-- Section 0: Details — name, type, industry, status
INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'name'),
        0, 'Details', 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'type'),
        0, 'Details', 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'industry'),
        0, 'Details', 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'status'),
        0, 'Details', 4, 'full'
    ),
    -- Section 1: Contact info — website, phone, email
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'website'),
        1, 'Contact info', 5, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'phone'),
        1, 'Contact info', 6, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'email'),
        1, 'Contact info', 7, 'full'
    ),
    -- Section 2: Address — address_line1, address_line2, city (half), region (half), postal_code (half), country (half)
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'address_line1'),
        2, 'Address', 8, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'address_line2'),
        2, 'Address', 9, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'city'),
        2, 'Address', 10, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'region'),
        2, 'Address', 11, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'postal_code'),
        2, 'Address', 12, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'country'),
        2, 'Address', 13, 'half'
    ),
    -- Section 3: Additional — annual_revenue (half), employee_count (half), description
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'annual_revenue'),
        3, 'Additional', 14, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'employee_count'),
        3, 'Additional', 15, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'description'),
        3, 'Additional', 16, 'full'
    );

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 5 — Replace Account list layout fields
-- ──────────────────────────────────────────────────────────────────────────────

-- Remove old list layout fields
DELETE FROM layout_fields
WHERE layout_id = (
    SELECT ld.id
    FROM layout_definitions ld
    JOIN object_definitions od ON ld.object_id = od.id
    WHERE od.api_name = 'account' AND ld.name = 'Default list'
);

-- Columns: name, type, industry, status, phone, email
INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default list'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'name'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default list'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'type'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default list'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'industry'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default list'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'status'),
        0, NULL, 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default list'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'phone'),
        0, NULL, 5, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'account' AND ld.name = 'Default list'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'account' AND fd.api_name = 'email'),
        0, NULL, 6, 'full'
    );
