-- Migration: 023_backfill_pipeline_managed_flag
-- Description: Ensures the stage field_definition for opportunity objects
--              includes the `pipeline_managed: true` flag in its options JSONB.
--              This flag is checked by the frontend to render StageFieldRenderer
--              instead of a regular dropdown.
--
-- Depends on: 006_metadata_schema (field_definitions, object_definitions)
--             017_add_tenant_id_to_all_tables (tenant_id columns)

UPDATE field_definitions
SET options = options || '{"pipeline_managed": true}'::jsonb
WHERE api_name = 'stage'
  AND object_id IN (
    SELECT id FROM object_definitions WHERE api_name = 'opportunity'
  )
  AND (options->>'pipeline_managed') IS NULL;
