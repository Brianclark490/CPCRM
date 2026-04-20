-- Migration: 026_pipeline_single_default_index
-- Description: Enforces a single `is_default = true` pipeline per
--              (tenant_id, object_id) via a partial unique index. Prior to
--              this migration, `updatePipeline` did not demote the previous
--              default when promoting a new one, and a tenant ended up with
--              two pipelines both flagged `is_default = true` for the same
--              object. The `stageMovementService.assignDefaultPipeline`
--              lookup then depended on `executeTakeFirst()` ordering and
--              could pick a different pipeline than the frontend expected,
--              causing cross-pipeline 400s when moving records.
--
--              Step 1 is a defensive backfill: if any (tenant_id, object_id)
--              currently has multiple defaults, keep the one most likely to
--              be the intended default — prefer `is_system = true`, then the
--              oldest `created_at`, then id as a final tiebreaker — and
--              demote the rest. (Ordering by id alone would be arbitrary
--              since id is a UUID.) This keeps the partial unique index
--              creation in step 2 from failing on existing corrupted rows.
--
--              Application-level enforcement also lives in
--              `updatePipeline` (wraps the is_default promotion in a
--              transaction that demotes siblings first); the index is
--              belt-and-braces against future regressions and concurrent
--              writes.
--
-- Depends on: 013_pipeline_and_stage_definitions (pipeline_definitions)
--             017_add_tenant_id_to_all_tables (tenant_id column)

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Backfill — demote extra defaults so the unique index can be created.
-- ══════════════════════════════════════════════════════════════════════════════
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, object_id
           -- Deterministic ordering that reflects intent: prefer system
           -- defaults, then the oldest pipeline, then id to break ties
           -- (id is a UUID so it is only a stable tiebreaker, not a
           -- meaningful ordering on its own).
           ORDER BY is_system DESC, created_at ASC, id ASC
         ) AS rn
  FROM pipeline_definitions
  WHERE is_default = true
)
UPDATE pipeline_definitions p
SET is_default = false,
    updated_at = NOW()
FROM ranked
WHERE ranked.id = p.id
  AND ranked.rn > 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Partial unique index — one default per (tenant_id, object_id).
-- ══════════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_definitions_single_default_per_object
  ON pipeline_definitions (tenant_id, object_id)
  WHERE is_default = true;
