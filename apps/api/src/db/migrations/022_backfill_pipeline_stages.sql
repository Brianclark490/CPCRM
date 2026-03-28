-- Migration: 022_backfill_pipeline_stages
-- Description: Backfills missing default pipeline stages for all tenants that
--              have a sales_pipeline but fewer than the standard 7 stages.
--              This is idempotent (ON CONFLICT DO NOTHING).
--
-- Depends on: 013_pipeline_and_stage_definitions (pipeline_definitions, stage_definitions)
--             017_add_tenant_id_to_all_tables (tenant_id columns)

DO $$
DECLARE
  v_tenant RECORD;
  v_pipeline_id UUID;
BEGIN
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM pipeline_definitions
  LOOP
    SELECT id INTO v_pipeline_id
    FROM pipeline_definitions
    WHERE tenant_id = v_tenant.tenant_id
      AND api_name = 'sales_pipeline';

    IF v_pipeline_id IS NOT NULL THEN
      INSERT INTO stage_definitions
        (pipeline_id, tenant_id, name, api_name, sort_order,
         stage_type, colour, default_probability, expected_days)
      VALUES
        (v_pipeline_id, v_tenant.tenant_id, 'Prospecting',    'prospecting',    0, 'open', 'blue',   10,   14),
        (v_pipeline_id, v_tenant.tenant_id, 'Qualification',  'qualification',  1, 'open', 'blue',   25,   14),
        (v_pipeline_id, v_tenant.tenant_id, 'Needs Analysis', 'needs_analysis', 2, 'open', 'purple', 40,   21),
        (v_pipeline_id, v_tenant.tenant_id, 'Proposal',       'proposal',       3, 'open', 'purple', 60,   14),
        (v_pipeline_id, v_tenant.tenant_id, 'Negotiation',    'negotiation',    4, 'open', 'amber',  80,   14),
        (v_pipeline_id, v_tenant.tenant_id, 'Closed Won',     'closed_won',     5, 'won',  'green',  100,  NULL),
        (v_pipeline_id, v_tenant.tenant_id, 'Closed Lost',    'closed_lost',    6, 'lost', 'red',    0,    NULL)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
