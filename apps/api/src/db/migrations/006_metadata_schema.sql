-- Migration: 006_metadata_schema
-- Description: Core metadata engine tables — defines WHAT objects and fields
--              exist in the CRM. Seeds system objects (account, opportunity)
--              and their built-in field definitions.
--
-- Depends on: 001_initial_schema (pgcrypto extension)

-- ──────────────────────────────────────────────────────────────────────────────
-- Object Definitions
-- Each row describes a CRM object type (e.g. "account", "opportunity").
-- System objects (is_system = true) are created by this migration and cannot
-- be deleted by end-users.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE object_definitions (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name      VARCHAR(100)  NOT NULL UNIQUE,
    label         VARCHAR(255)  NOT NULL,
    plural_label  VARCHAR(255)  NOT NULL,
    description   TEXT,
    icon          VARCHAR(50),
    is_system     BOOLEAN       NOT NULL DEFAULT false,
    owner_id      VARCHAR(255)  NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_object_definitions_api_name ON object_definitions (api_name);

-- ──────────────────────────────────────────────────────────────────────────────
-- Field Definitions
-- Each row describes a field on an object. The field_type determines how the
-- value is stored, validated, and rendered. Type-specific configuration is
-- stored in the JSONB `options` column.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE field_definitions (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id     UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE CASCADE,
    api_name      VARCHAR(100)  NOT NULL,
    label         VARCHAR(255)  NOT NULL,
    field_type    VARCHAR(50)   NOT NULL,
    description   TEXT,
    required      BOOLEAN       NOT NULL DEFAULT false,
    default_value TEXT,
    options       JSONB         DEFAULT '{}',
    sort_order    INTEGER       NOT NULL DEFAULT 0,
    is_system     BOOLEAN       NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, api_name)
);

CREATE INDEX idx_field_definitions_object_id          ON field_definitions (object_id);
CREATE INDEX idx_field_definitions_object_id_api_name ON field_definitions (object_id, api_name);
CREATE INDEX idx_field_definitions_sort_order         ON field_definitions (sort_order);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — system objects
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO object_definitions (api_name, label, plural_label, description, icon, is_system, owner_id)
VALUES
    ('account',     'Account',     'Accounts',      'A business or organisation being tracked in the CRM', 'building', true, 'SYSTEM'),
    ('opportunity', 'Opportunity', 'Opportunities',  'A potential deal or sale linked to an account',       'dollar-sign', true, 'SYSTEM');

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — account field definitions
-- Fields mirror the existing accounts table schema.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, description, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'name',          'Name',           'text',     'Company or customer name',  true,  '{"max_length": 200}', 1,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'industry',      'Industry',       'text',     'Industry sector',           false, '{"max_length": 255}', 2,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'website',       'Website',        'url',      'Company website',           false, '{}',                  3,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'phone',         'Phone',          'phone',    'Primary phone number',      false, '{}',                  4,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'email',         'Email',          'email',    'Primary email address',     false, '{}',                  5,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'address_line1', 'Address Line 1', 'text',     'Street address line 1',     false, '{"max_length": 255}', 6,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'address_line2', 'Address Line 2', 'text',     'Street address line 2',     false, '{"max_length": 255}', 7,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'city',          'City',           'text',     'City',                      false, '{"max_length": 100}', 8,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'region',        'Region',         'text',     'State, county, or region',  false, '{"max_length": 100}', 9,  true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'postal_code',   'Postal Code',    'text',     'Postal or ZIP code',        false, '{"max_length": 20}',  10, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'country',       'Country',        'text',     'Country',                   false, '{"max_length": 100}', 11, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'account'), 'notes',         'Notes',          'textarea', 'Free-form notes',           false, '{}',                  12, true);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — opportunity field definitions
-- Fields mirror the existing opportunities table schema.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO field_definitions (object_id, api_name, label, field_type, description, required, options, sort_order, is_system)
VALUES
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'title',               'Title',               'text',     'Opportunity title',                          true,  '{"max_length": 200}', 1, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'stage',               'Stage',               'dropdown', 'Current pipeline stage',                     true,  '{"choices": ["prospecting", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"]}', 2, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'value',               'Value',               'currency', 'Monetary value of the opportunity',          false, '{"min": 0, "precision": 2}', 3, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'currency',            'Currency',            'text',     'ISO 4217 currency code (e.g. GBP, USD)',     false, '{"max_length": 3}',  4, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'expected_close_date', 'Expected Close Date', 'date',     'Date the deal is expected to close',         false, '{}',                  5, true),
    ((SELECT id FROM object_definitions WHERE api_name = 'opportunity'), 'description',         'Description',         'textarea', 'Additional details or notes',                false, '{}',                  6, true);
