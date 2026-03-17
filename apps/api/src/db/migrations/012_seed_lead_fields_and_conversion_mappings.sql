-- Migration: 012_seed_lead_fields_and_conversion_mappings
-- Description: Seeds all 14 field definitions for the Lead object, creates the
--              lead_conversion_mappings table with seed data for lead-to-account,
--              lead-to-contact, and lead-to-opportunity field mapping, and creates
--              default form and list layouts for Lead.
--
--              The Lead "name" column in the records table should be computed as
--              "{first_name} {last_name}" by the application layer when creating
--              or updating a lead record.
--
-- Depends on: 006_metadata_schema (object_definitions, field_definitions)
--             009_layout_definitions (layout_definitions, layout_fields)
--             011_seed_default_object_definitions (lead object_definition)

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Lead field definitions
-- 14 fields covering contact info, company details, lead qualification, and notes.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'first_name',      'First Name',      'text',     true,  '{"max_length": 100}', 1,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'last_name',       'Last Name',       'text',     true,  '{"max_length": 100}', 2,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'company',         'Company',         'text',     false, '{"max_length": 255}', 3,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'email',           'Email',           'email',    false, '{}',                  4,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'phone',           'Phone',           'phone',    false, '{}',                  5,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'job_title',       'Job Title',       'text',     false, '{"max_length": 200}', 6,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'source',          'Lead Source',     'dropdown', false, '{"choices": ["Website", "Referral", "Cold Call", "Email Campaign", "Social Media", "Event", "Advertisement", "Partner", "Other"]}', 7,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'status',          'Status',          'dropdown', true,  '{"choices": ["New", "Contacted", "Qualified", "Unqualified", "Converted"]}', 8,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'rating',          'Rating',          'dropdown', false, '{"choices": ["Hot", "Warm", "Cold"]}', 9,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'estimated_value', 'Estimated Value', 'currency', false, '{"min": 0, "precision": 2}', 10, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'industry',        'Industry',        'dropdown', false, '{"choices": ["Technology", "Healthcare", "Finance", "Manufacturing", "Retail", "Education", "Real Estate", "Professional Services", "Non-Profit", "Government", "Other"]}', 11, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'website',         'Website',         'url',      false, '{}',                  12, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'address',         'Address',         'textarea', false, '{}',                  13, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'description',     'Description',     'textarea', false, '{}',                  14, true);

-- ──────────────────────────────────────────────────────────────────────────────
-- Lead Conversion Mappings
-- Defines how lead fields map to target objects (account, contact, opportunity)
-- during lead conversion. Used by the application layer to auto-populate
-- target records when a lead is converted.
--
-- Note: The mapping for opportunity "name" is special — it should be computed
-- as "{company} - Opportunity" by the application layer.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_conversion_mappings (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_field_api_name    VARCHAR(100)  NOT NULL,
    target_object          VARCHAR(50)   NOT NULL,
    target_field_api_name  VARCHAR(100)  NOT NULL,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (lead_field_api_name, target_object, target_field_api_name)
);

CREATE INDEX IF NOT EXISTS idx_lead_conversion_mappings_target_object ON lead_conversion_mappings (target_object);

-- Lead → Account mappings
INSERT INTO lead_conversion_mappings (lead_field_api_name, target_object, target_field_api_name)
VALUES
    ('company',  'account', 'name'),
    ('industry', 'account', 'industry'),
    ('website',  'account', 'website'),
    ('phone',    'account', 'phone'),
    ('email',    'account', 'email'),
    ('address',  'account', 'address_line1');

-- Lead → Contact mappings
INSERT INTO lead_conversion_mappings (lead_field_api_name, target_object, target_field_api_name)
VALUES
    ('first_name', 'contact', 'first_name'),
    ('last_name',  'contact', 'last_name'),
    ('email',      'contact', 'email'),
    ('phone',      'contact', 'phone'),
    ('job_title',  'contact', 'job_title');

-- Lead → Opportunity mappings
-- Note: "company + ' - Opportunity'" → opportunity "name" is a computed mapping
-- handled by the application layer, not a direct field-to-field mapping.
INSERT INTO lead_conversion_mappings (lead_field_api_name, target_object, target_field_api_name)
VALUES
    ('company',         'opportunity', 'name'),
    ('estimated_value', 'opportunity', 'value'),
    ('source',          'opportunity', 'source'),
    ('description',     'opportunity', 'description');

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Lead default layouts
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_definitions (object_id, name, layout_type, is_default)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'Default Form', 'form', true),
    ((SELECT id FROM object_definitions WHERE api_name = 'lead'), 'List View',    'list', true);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Lead "Default Form" layout fields
-- 14 fields grouped into 4 sections:
--   Section 0: Contact Info — first_name (half), last_name (half), email, phone (half), job_title (half)
--   Section 1: Company — company, industry, website
--   Section 2: Lead Details — source, status, rating, estimated_value
--   Section 3: Other — address, description
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    -- Section 0: Contact Info
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'first_name'),
        0, 'Contact Info', 1, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'last_name'),
        0, 'Contact Info', 2, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'email'),
        0, 'Contact Info', 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'phone'),
        0, 'Contact Info', 4, 'half'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'job_title'),
        0, 'Contact Info', 5, 'half'
    ),
    -- Section 1: Company
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'company'),
        1, 'Company', 6, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'industry'),
        1, 'Company', 7, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'website'),
        1, 'Company', 8, 'full'
    ),
    -- Section 2: Lead Details
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'source'),
        2, 'Lead Details', 9, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'status'),
        2, 'Lead Details', 10, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'rating'),
        2, 'Lead Details', 11, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'estimated_value'),
        2, 'Lead Details', 12, 'full'
    ),
    -- Section 3: Other
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'address'),
        3, 'Other', 13, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'Default Form'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'description'),
        3, 'Other', 14, 'full'
    );

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Lead "List View" layout fields
-- Columns: first_name, last_name, company, status, rating, source
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO layout_fields (layout_id, field_id, section, section_label, sort_order, width)
VALUES
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'first_name'),
        0, NULL, 1, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'last_name'),
        0, NULL, 2, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'company'),
        0, NULL, 3, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'status'),
        0, NULL, 4, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'rating'),
        0, NULL, 5, 'full'
    ),
    (
        (SELECT ld.id FROM layout_definitions ld JOIN object_definitions od ON ld.object_id = od.id WHERE od.api_name = 'lead' AND ld.name = 'List View'),
        (SELECT fd.id FROM field_definitions fd JOIN object_definitions od ON fd.object_id = od.id WHERE od.api_name = 'lead' AND fd.api_name = 'source'),
        0, NULL, 6, 'full'
    );
