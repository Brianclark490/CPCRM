-- Migration: 013_pipeline_and_stage_definitions
-- Description: Pipeline configuration tables for managing sales pipelines,
--              stages, stage gates (qualification rules), and stage history
--              (analytics). Also extends the records table with pipeline columns.
--
-- Depends on: 006_metadata_schema (object_definitions, field_definitions)
--             008_records_and_record_relationships (records)

-- ──────────────────────────────────────────────────────────────────────────────
-- Pipeline Definitions
-- Each row describes a named pipeline for a CRM object (e.g. "Sales Pipeline").
-- An object can have multiple pipelines but only one default.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_definitions (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id   UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE CASCADE,
    name        VARCHAR(255)  NOT NULL,
    api_name    VARCHAR(100)  NOT NULL UNIQUE,
    description TEXT,
    is_default  BOOLEAN       NOT NULL DEFAULT false,
    is_system   BOOLEAN       NOT NULL DEFAULT false,
    owner_id    VARCHAR(255)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, api_name)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Stage Definitions
-- Each row describes a stage within a pipeline. Stages are ordered by
-- sort_order and categorised as 'open', 'won', or 'lost'.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stage_definitions (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id           UUID          NOT NULL REFERENCES pipeline_definitions (id) ON DELETE CASCADE,
    name                  VARCHAR(255)  NOT NULL,
    api_name              VARCHAR(100)  NOT NULL,
    sort_order            INTEGER       NOT NULL,
    stage_type            VARCHAR(20)   NOT NULL DEFAULT 'open',
    colour                VARCHAR(20)   NOT NULL DEFAULT 'blue',
    default_probability   INTEGER       DEFAULT NULL,
    expected_days         INTEGER       DEFAULT NULL,
    description           TEXT,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (pipeline_id, api_name),
    UNIQUE (pipeline_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_stage_definitions_pipeline_id            ON stage_definitions (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_stage_definitions_pipeline_id_sort_order ON stage_definitions (pipeline_id, sort_order);

-- ──────────────────────────────────────────────────────────────────────────────
-- Stage Gates
-- Qualification rules — which fields must be filled before entering a stage.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stage_gates (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id      UUID          NOT NULL REFERENCES stage_definitions (id) ON DELETE CASCADE,
    field_id      UUID          NOT NULL REFERENCES field_definitions (id) ON DELETE CASCADE,
    gate_type     VARCHAR(50)   NOT NULL DEFAULT 'required',
    gate_value    TEXT          DEFAULT NULL,
    error_message VARCHAR(500)  DEFAULT NULL,
    UNIQUE (stage_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_stage_gates_stage_id ON stage_gates (stage_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Stage History
-- Tracks when records move between stages for analytics.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stage_history (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id               UUID          NOT NULL REFERENCES records (id) ON DELETE CASCADE,
    pipeline_id             UUID          NOT NULL REFERENCES pipeline_definitions (id),
    from_stage_id           UUID          REFERENCES stage_definitions (id),
    to_stage_id             UUID          NOT NULL REFERENCES stage_definitions (id),
    changed_by              VARCHAR(255)  NOT NULL,
    changed_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    days_in_previous_stage  INTEGER       DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_history_record_id              ON stage_history (record_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_record_id_pipeline_id  ON stage_history (record_id, pipeline_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_at             ON stage_history (changed_at);

-- ──────────────────────────────────────────────────────────────────────────────
-- Extend records table with pipeline columns
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE records
    ADD COLUMN IF NOT EXISTS pipeline_id       UUID          REFERENCES pipeline_definitions (id),
    ADD COLUMN IF NOT EXISTS current_stage_id   UUID          REFERENCES stage_definitions (id),
    ADD COLUMN IF NOT EXISTS stage_entered_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_records_pipeline_id      ON records (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_records_current_stage_id ON records (current_stage_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Default sales pipeline for Opportunity
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO pipeline_definitions (object_id, name, api_name, is_default, is_system, owner_id)
VALUES (
    (SELECT id FROM object_definitions WHERE api_name = 'opportunity'),
    'Sales Pipeline',
    'sales_pipeline',
    true,
    true,
    'SYSTEM'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — 7 default stages
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO stage_definitions (pipeline_id, name, api_name, sort_order, stage_type, colour, default_probability, expected_days)
VALUES
    ((SELECT id FROM pipeline_definitions WHERE api_name = 'sales_pipeline'), 'Prospecting',    'prospecting',    0, 'open', 'blue',   10,   14),
    ((SELECT id FROM pipeline_definitions WHERE api_name = 'sales_pipeline'), 'Qualification',  'qualification',  1, 'open', 'blue',   25,   14),
    ((SELECT id FROM pipeline_definitions WHERE api_name = 'sales_pipeline'), 'Needs Analysis', 'needs_analysis', 2, 'open', 'purple', 40,   21),
    ((SELECT id FROM pipeline_definitions WHERE api_name = 'sales_pipeline'), 'Proposal',       'proposal',       3, 'open', 'purple', 60,   14),
    ((SELECT id FROM pipeline_definitions WHERE api_name = 'sales_pipeline'), 'Negotiation',    'negotiation',    4, 'open', 'amber',  80,   14),
    ((SELECT id FROM pipeline_definitions WHERE api_name = 'sales_pipeline'), 'Closed Won',     'closed_won',     5, 'won',  'green',  100,  NULL),
    ((SELECT id FROM pipeline_definitions WHERE api_name = 'sales_pipeline'), 'Closed Lost',    'closed_lost',    6, 'lost', 'red',    0,    NULL);

-- ──────────────────────────────────────────────────────────────────────────────
-- Seed data — Stage gates (qualification rules)
-- ──────────────────────────────────────────────────────────────────────────────

-- Helper: resolve the opportunity object_id once
DO $$
DECLARE
    v_opp_object_id UUID;
    v_pipeline_id   UUID;
    v_qual_id       UUID;
    v_needs_id      UUID;
    v_proposal_id   UUID;
    v_negotiation_id UUID;
    v_closed_won_id UUID;
    v_value_field_id       UUID;
    v_close_date_field_id  UUID;
    v_description_field_id UUID;
    v_probability_field_id UUID;
BEGIN
    SELECT id INTO v_opp_object_id FROM object_definitions WHERE api_name = 'opportunity';
    SELECT id INTO v_pipeline_id   FROM pipeline_definitions WHERE api_name = 'sales_pipeline';

    -- Resolve stage IDs
    SELECT id INTO v_qual_id       FROM stage_definitions WHERE pipeline_id = v_pipeline_id AND api_name = 'qualification';
    SELECT id INTO v_needs_id      FROM stage_definitions WHERE pipeline_id = v_pipeline_id AND api_name = 'needs_analysis';
    SELECT id INTO v_proposal_id   FROM stage_definitions WHERE pipeline_id = v_pipeline_id AND api_name = 'proposal';
    SELECT id INTO v_negotiation_id FROM stage_definitions WHERE pipeline_id = v_pipeline_id AND api_name = 'negotiation';
    SELECT id INTO v_closed_won_id FROM stage_definitions WHERE pipeline_id = v_pipeline_id AND api_name = 'closed_won';

    -- Resolve field IDs
    SELECT id INTO v_value_field_id       FROM field_definitions WHERE object_id = v_opp_object_id AND api_name = 'value';
    SELECT id INTO v_close_date_field_id  FROM field_definitions WHERE object_id = v_opp_object_id AND api_name = 'close_date';
    SELECT id INTO v_description_field_id FROM field_definitions WHERE object_id = v_opp_object_id AND api_name = 'description';
    SELECT id INTO v_probability_field_id FROM field_definitions WHERE object_id = v_opp_object_id AND api_name = 'probability';

    -- Qualification gate: value (required)
    INSERT INTO stage_gates (stage_id, field_id, gate_type, error_message)
    VALUES (v_qual_id, v_value_field_id, 'required', 'Deal value is required to enter Qualification');

    -- Needs Analysis gate: close_date (required)
    INSERT INTO stage_gates (stage_id, field_id, gate_type, error_message)
    VALUES (v_needs_id, v_close_date_field_id, 'required', 'Expected close date is required');

    -- Proposal gates: value (required), close_date (required), description (required)
    INSERT INTO stage_gates (stage_id, field_id, gate_type, error_message)
    VALUES
        (v_proposal_id, v_value_field_id,       'required', NULL),
        (v_proposal_id, v_close_date_field_id,  'required', NULL),
        (v_proposal_id, v_description_field_id, 'required', 'A description of the opportunity is required');

    -- Negotiation gates: value (min_value: 0), close_date (required), probability (required)
    INSERT INTO stage_gates (stage_id, field_id, gate_type, gate_value, error_message)
    VALUES
        (v_negotiation_id, v_value_field_id,       'min_value', '0', 'Deal value must be set'),
        (v_negotiation_id, v_close_date_field_id,  'required',  NULL, NULL),
        (v_negotiation_id, v_probability_field_id, 'required',  NULL, NULL);

    -- Closed Won gates: value (required), close_date (required)
    INSERT INTO stage_gates (stage_id, field_id, gate_type, error_message)
    VALUES
        (v_closed_won_id, v_value_field_id,      'required', NULL),
        (v_closed_won_id, v_close_date_field_id, 'required', NULL);
END $$;
