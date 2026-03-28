-- Migration: 024_fix_stage_sort_order_and_pipeline_assignment
-- Description: Drops the problematic unique constraint on (tenant_id, pipeline_id, sort_order)
--              in stage_definitions which prevents sort_order shifting during stage creation
--              and reordering. Backfills missing open stages for existing sales pipelines.
--              Assigns the default pipeline to opportunity records that are missing one.
--
-- Depends on: 013_pipeline_and_stage_definitions (stage_definitions)
--             017_add_tenant_id_to_all_tables (tenant_id columns, unique constraints)
--             022_backfill_pipeline_stages (previous backfill attempt)

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Drop the unique constraint on (tenant_id, pipeline_id, sort_order)
--
-- This constraint prevents sort_order shifting during stage creation and
-- reordering because PostgreSQL checks UNIQUE constraints per-row during
-- UPDATE statements. For example, shifting sort_order from [0,1] to [1,2]
-- can fail when the first row (0→1) temporarily conflicts with the second
-- row (still at 1). Sort order is managed by the application layer and
-- does not need a database-level uniqueness guarantee.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE stage_definitions
  DROP CONSTRAINT IF EXISTS uq_stage_definitions_tenant_pipeline_sort_order;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Backfill missing open stages for existing sales pipelines
--
-- Migration 022 attempted this but failed silently for pipelines where
-- the terminal stages (Closed Won, Closed Lost) occupied sort_orders 0 and 1,
-- because the now-dropped unique constraint on sort_order caused ON CONFLICT
-- DO NOTHING to skip the inserts.
--
-- This step:
-- a) Moves existing terminal stages to sort_orders 5 and 6
-- b) Inserts the 5 missing open stages (sort_orders 0–4)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT pd.id AS pipeline_id, pd.tenant_id
    FROM pipeline_definitions pd
    WHERE pd.api_name = 'sales_pipeline'
      AND NOT EXISTS (
        SELECT 1 FROM stage_definitions sd
        WHERE sd.pipeline_id = pd.id
          AND sd.tenant_id = pd.tenant_id
          AND sd.api_name = 'prospecting'
      )
  LOOP
    -- Move terminal stages to their correct sort_orders (5 and 6)
    UPDATE stage_definitions
    SET sort_order = 5
    WHERE pipeline_id = v_rec.pipeline_id
      AND tenant_id = v_rec.tenant_id
      AND api_name = 'closed_won';

    UPDATE stage_definitions
    SET sort_order = 6
    WHERE pipeline_id = v_rec.pipeline_id
      AND tenant_id = v_rec.tenant_id
      AND api_name = 'closed_lost';

    -- Insert the missing open stages
    INSERT INTO stage_definitions
      (pipeline_id, tenant_id, name, api_name, sort_order,
       stage_type, colour, default_probability, expected_days)
    VALUES
      (v_rec.pipeline_id, v_rec.tenant_id, 'Prospecting',    'prospecting',    0, 'open',  'blue',   10, 14),
      (v_rec.pipeline_id, v_rec.tenant_id, 'Qualification',  'qualification',  1, 'open',  'blue',   25, 14),
      (v_rec.pipeline_id, v_rec.tenant_id, 'Needs Analysis', 'needs_analysis', 2, 'open',  'purple', 40, 21),
      (v_rec.pipeline_id, v_rec.tenant_id, 'Proposal',       'proposal',       3, 'open',  'purple', 60, 14),
      (v_rec.pipeline_id, v_rec.tenant_id, 'Negotiation',    'negotiation',    4, 'open',  'amber',  80, 14)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Assign default pipeline to opportunity records that are missing one
--
-- For opportunities created before pipeline assignment was working, set
-- pipeline_id to the default pipeline and current_stage_id to the first
-- open stage (sort_order = 0).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE records r
SET pipeline_id = sub.pipeline_id,
    current_stage_id = sub.first_stage_id,
    stage_entered_at = NOW()
FROM (
  SELECT pd.id AS pipeline_id,
         pd.tenant_id,
         pd.object_id,
         (
           SELECT sd.id FROM stage_definitions sd
           WHERE sd.pipeline_id = pd.id
             AND sd.tenant_id = pd.tenant_id
             AND sd.stage_type = 'open'
           ORDER BY sd.sort_order ASC
           LIMIT 1
         ) AS first_stage_id
  FROM pipeline_definitions pd
  JOIN object_definitions od ON pd.object_id = od.id
  WHERE od.api_name = 'opportunity'
    AND pd.is_default = true
) sub
WHERE r.object_id = sub.object_id
  AND r.tenant_id = sub.tenant_id
  AND r.pipeline_id IS NULL
  AND sub.first_stage_id IS NOT NULL;
