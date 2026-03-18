-- Migration: 017_add_tenant_id_to_all_tables
-- Description: Converts the tenants table to use VARCHAR(255) primary key
--              matching Descope tenant IDs, adds plan/settings columns, then
--              adds tenant_id to all metadata, data, pipeline, and permission
--              tables. Backfills existing rows with a 'default' tenant, updates
--              unique constraints to include tenant_id, and rebuilds indexes
--              with tenant_id as the leading column.
--
--              This enables per-tenant data isolation and prepares the schema
--              for future Row Level Security (RLS) policies.
--
-- Depends on: 001_initial_schema (tenants table)
--             006_metadata_schema (object_definitions, field_definitions)
--             007_relationship_definitions (relationship_definitions)
--             008_records_and_record_relationships (records, record_relationships)
--             009_layout_definitions (layout_definitions, layout_fields)
--             012_seed_lead_fields_and_conversion_mappings (lead_conversion_mappings)
--             013_pipeline_and_stage_definitions (pipeline_definitions, stage_definitions, stage_gates, stage_history)
--             016_object_permissions_and_teams (object_permissions, teams, team_members)
--
-- Reversibility: To reverse this migration manually:
--   1. Drop all idx_*_tenant_* indexes
--   2. Recreate original indexes (see migrations 006–016)
--   3. Drop the new UNIQUE constraints and recreate originals
--   4. ALTER each table DROP COLUMN tenant_id
--   5. Remove the 'default' tenant row
--   6. Revert tenants table columns (drop plan, settings; revert id type to UUID)

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1: Alter the tenants table
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop remaining FK from contacts → tenants (still referencing UUID id)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_tenant_id_fkey;
ALTER TABLE contacts ALTER COLUMN tenant_id TYPE VARCHAR(255);

-- Convert tenants.id from UUID to VARCHAR(255)
ALTER TABLE tenants ALTER COLUMN id TYPE VARCHAR(255);
ALTER TABLE tenants ALTER COLUMN name TYPE VARCHAR(255);
ALTER TABLE tenants ALTER COLUMN slug TYPE VARCHAR(100);

-- Change status from tenant_status enum to VARCHAR(50)
ALTER TABLE tenants ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tenants ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
ALTER TABLE tenants ALTER COLUMN status SET DEFAULT 'active';

-- Add new columns for multi-tenant SaaS
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 2: Insert default tenant for backfilling existing data
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO tenants (id, name, slug, status)
VALUES ('default', 'Default Tenant', 'default', 'active')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 3: Add tenant_id columns (NULLABLE initially)
-- ══════════════════════════════════════════════════════════════════════════════

-- Metadata tables
ALTER TABLE object_definitions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE field_definitions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE relationship_definitions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE layout_definitions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE layout_fields ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);

-- Pipeline tables
ALTER TABLE pipeline_definitions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE stage_definitions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE stage_gates ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE stage_history ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);

-- Data tables
ALTER TABLE records ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE record_relationships ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);

-- Permission tables
ALTER TABLE object_permissions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);

-- Other
ALTER TABLE lead_conversion_mappings ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255);

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 4: Backfill all existing rows with 'default'
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE object_definitions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE field_definitions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE relationship_definitions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE layout_definitions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE layout_fields SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE pipeline_definitions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE stage_definitions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE stage_gates SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE stage_history SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE records SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE record_relationships SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE object_permissions SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE teams SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE team_members SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE lead_conversion_mappings SET tenant_id = 'default' WHERE tenant_id IS NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 5: Set columns to NOT NULL and add FK references to tenants
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE object_definitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE field_definitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE relationship_definitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE layout_definitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE layout_fields ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pipeline_definitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE stage_definitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE stage_gates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE stage_history ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE records ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE record_relationships ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE object_permissions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE teams ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE team_members ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lead_conversion_mappings ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE object_definitions ADD CONSTRAINT fk_object_definitions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE field_definitions ADD CONSTRAINT fk_field_definitions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE relationship_definitions ADD CONSTRAINT fk_relationship_definitions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE layout_definitions ADD CONSTRAINT fk_layout_definitions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE layout_fields ADD CONSTRAINT fk_layout_fields_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE pipeline_definitions ADD CONSTRAINT fk_pipeline_definitions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE stage_definitions ADD CONSTRAINT fk_stage_definitions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE stage_gates ADD CONSTRAINT fk_stage_gates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE stage_history ADD CONSTRAINT fk_stage_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE records ADD CONSTRAINT fk_records_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE record_relationships ADD CONSTRAINT fk_record_relationships_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE object_permissions ADD CONSTRAINT fk_object_permissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE team_members ADD CONSTRAINT fk_team_members_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE lead_conversion_mappings ADD CONSTRAINT fk_lead_conversion_mappings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 6: Update UNIQUE constraints to include tenant_id
-- ══════════════════════════════════════════════════════════════════════════════

-- object_definitions: api_name → (tenant_id, api_name)
ALTER TABLE object_definitions DROP CONSTRAINT IF EXISTS object_definitions_api_name_key;
ALTER TABLE object_definitions ADD CONSTRAINT uq_object_definitions_tenant_api_name UNIQUE (tenant_id, api_name);

-- field_definitions: (object_id, api_name) → (tenant_id, object_id, api_name)
ALTER TABLE field_definitions DROP CONSTRAINT IF EXISTS field_definitions_object_id_api_name_key;
ALTER TABLE field_definitions ADD CONSTRAINT uq_field_definitions_tenant_object_api_name UNIQUE (tenant_id, object_id, api_name);

-- relationship_definitions: (source_object_id, api_name) → (tenant_id, source_object_id, api_name)
ALTER TABLE relationship_definitions DROP CONSTRAINT IF EXISTS relationship_definitions_source_object_id_api_name_key;
ALTER TABLE relationship_definitions ADD CONSTRAINT uq_relationship_definitions_tenant_source_api_name UNIQUE (tenant_id, source_object_id, api_name);

-- layout_definitions: (object_id, name) → (tenant_id, object_id, name)
ALTER TABLE layout_definitions DROP CONSTRAINT IF EXISTS layout_definitions_object_id_name_key;
ALTER TABLE layout_definitions ADD CONSTRAINT uq_layout_definitions_tenant_object_name UNIQUE (tenant_id, object_id, name);

-- layout_fields: (layout_id, field_id) → (tenant_id, layout_id, field_id)
ALTER TABLE layout_fields DROP CONSTRAINT IF EXISTS layout_fields_layout_id_field_id_key;
ALTER TABLE layout_fields ADD CONSTRAINT uq_layout_fields_tenant_layout_field UNIQUE (tenant_id, layout_id, field_id);

-- pipeline_definitions: api_name unique, (object_id, api_name) → (tenant_id, api_name), (tenant_id, object_id, api_name)
ALTER TABLE pipeline_definitions DROP CONSTRAINT IF EXISTS pipeline_definitions_api_name_key;
ALTER TABLE pipeline_definitions DROP CONSTRAINT IF EXISTS pipeline_definitions_object_id_api_name_key;
ALTER TABLE pipeline_definitions ADD CONSTRAINT uq_pipeline_definitions_tenant_api_name UNIQUE (tenant_id, api_name);
ALTER TABLE pipeline_definitions ADD CONSTRAINT uq_pipeline_definitions_tenant_object_api_name UNIQUE (tenant_id, object_id, api_name);

-- stage_definitions: (pipeline_id, api_name), (pipeline_id, sort_order) → include tenant_id
ALTER TABLE stage_definitions DROP CONSTRAINT IF EXISTS stage_definitions_pipeline_id_api_name_key;
ALTER TABLE stage_definitions DROP CONSTRAINT IF EXISTS stage_definitions_pipeline_id_sort_order_key;
ALTER TABLE stage_definitions ADD CONSTRAINT uq_stage_definitions_tenant_pipeline_api_name UNIQUE (tenant_id, pipeline_id, api_name);
ALTER TABLE stage_definitions ADD CONSTRAINT uq_stage_definitions_tenant_pipeline_sort_order UNIQUE (tenant_id, pipeline_id, sort_order);

-- stage_gates: (stage_id, field_id) → (tenant_id, stage_id, field_id)
ALTER TABLE stage_gates DROP CONSTRAINT IF EXISTS stage_gates_stage_id_field_id_key;
ALTER TABLE stage_gates ADD CONSTRAINT uq_stage_gates_tenant_stage_field UNIQUE (tenant_id, stage_id, field_id);

-- record_relationships: (relationship_id, source_record_id, target_record_id) → include tenant_id
ALTER TABLE record_relationships DROP CONSTRAINT IF EXISTS record_relationships_relationship_id_source_record_id_targ_key;
ALTER TABLE record_relationships ADD CONSTRAINT uq_record_relationships_tenant_rel_source_target UNIQUE (tenant_id, relationship_id, source_record_id, target_record_id);

-- object_permissions: (object_id, role) → (tenant_id, object_id, role)
ALTER TABLE object_permissions DROP CONSTRAINT IF EXISTS object_permissions_object_id_role_key;
ALTER TABLE object_permissions ADD CONSTRAINT uq_object_permissions_tenant_object_role UNIQUE (tenant_id, object_id, role);

-- team_members: (team_id, user_id) → (tenant_id, team_id, user_id)
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_team_id_user_id_key;
ALTER TABLE team_members ADD CONSTRAINT uq_team_members_tenant_team_user UNIQUE (tenant_id, team_id, user_id);

-- lead_conversion_mappings: (lead_field_api_name, target_object, target_field_api_name) → include tenant_id
ALTER TABLE lead_conversion_mappings DROP CONSTRAINT IF EXISTS lead_conversion_mappings_lead_field_api_name_target_object__key;
ALTER TABLE lead_conversion_mappings ADD CONSTRAINT uq_lead_conversion_mappings_tenant_field_target UNIQUE (tenant_id, lead_field_api_name, target_object, target_field_api_name);

-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 7: Rebuild indexes with tenant_id as the leading column
-- ══════════════════════════════════════════════════════════════════════════════

-- ── object_definitions ───────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_object_definitions_api_name;
DROP INDEX IF EXISTS idx_object_definitions_sort_order;
CREATE INDEX idx_object_definitions_tenant_api_name ON object_definitions (tenant_id, api_name);
CREATE INDEX idx_object_definitions_tenant_sort_order ON object_definitions (tenant_id, sort_order);

-- ── field_definitions ────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_field_definitions_object_id;
DROP INDEX IF EXISTS idx_field_definitions_object_id_api_name;
DROP INDEX IF EXISTS idx_field_definitions_sort_order;
CREATE INDEX idx_field_definitions_tenant_object ON field_definitions (tenant_id, object_id);
CREATE INDEX idx_field_definitions_tenant_object_api_name ON field_definitions (tenant_id, object_id, api_name);
CREATE INDEX idx_field_definitions_tenant_sort_order ON field_definitions (tenant_id, sort_order);

-- ── relationship_definitions ─────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_relationship_definitions_source_object_id;
DROP INDEX IF EXISTS idx_relationship_definitions_target_object_id;
CREATE INDEX idx_relationship_definitions_tenant_source ON relationship_definitions (tenant_id, source_object_id);
CREATE INDEX idx_relationship_definitions_tenant_target ON relationship_definitions (tenant_id, target_object_id);

-- ── layout_definitions ───────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_layout_definitions_object_id;
DROP INDEX IF EXISTS idx_layout_definitions_layout_type;
CREATE INDEX idx_layout_definitions_tenant_object ON layout_definitions (tenant_id, object_id);
CREATE INDEX idx_layout_definitions_tenant_layout_type ON layout_definitions (tenant_id, layout_type);

-- ── layout_fields ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_layout_fields_layout_id;
DROP INDEX IF EXISTS idx_layout_fields_field_id;
CREATE INDEX idx_layout_fields_tenant_layout ON layout_fields (tenant_id, layout_id);
CREATE INDEX idx_layout_fields_tenant_field ON layout_fields (tenant_id, field_id);

-- ── pipeline_definitions ─────────────────────────────────────────────────────
CREATE INDEX idx_pipeline_definitions_tenant_object ON pipeline_definitions (tenant_id, object_id);

-- ── stage_definitions ────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_stage_definitions_pipeline_id;
DROP INDEX IF EXISTS idx_stage_definitions_pipeline_id_sort_order;
CREATE INDEX idx_stage_definitions_tenant_pipeline ON stage_definitions (tenant_id, pipeline_id);
CREATE INDEX idx_stage_definitions_tenant_pipeline_sort_order ON stage_definitions (tenant_id, pipeline_id, sort_order);

-- ── stage_gates ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_stage_gates_stage_id;
CREATE INDEX idx_stage_gates_tenant_stage ON stage_gates (tenant_id, stage_id);

-- ── stage_history ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_stage_history_record_id;
DROP INDEX IF EXISTS idx_stage_history_record_id_pipeline_id;
DROP INDEX IF EXISTS idx_stage_history_changed_at;
CREATE INDEX idx_stage_history_tenant_record ON stage_history (tenant_id, record_id);
CREATE INDEX idx_stage_history_tenant_record_pipeline ON stage_history (tenant_id, record_id, pipeline_id);
CREATE INDEX idx_stage_history_tenant_changed_at ON stage_history (tenant_id, changed_at);

-- ── records ──────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_records_object_id;
DROP INDEX IF EXISTS idx_records_owner_id;
DROP INDEX IF EXISTS idx_records_object_owner;
DROP INDEX IF EXISTS idx_records_name;
DROP INDEX IF EXISTS idx_records_pipeline_id;
DROP INDEX IF EXISTS idx_records_current_stage_id;
-- Keep idx_records_field_values GIN index as-is (GIN does not benefit from a leading column)
CREATE INDEX idx_records_tenant_object ON records (tenant_id, object_id);
CREATE INDEX idx_records_tenant_owner ON records (tenant_id, owner_id);
CREATE INDEX idx_records_tenant_object_owner ON records (tenant_id, object_id, owner_id);
CREATE INDEX idx_records_tenant_name ON records (tenant_id, name);
CREATE INDEX idx_records_tenant_pipeline ON records (tenant_id, pipeline_id);
CREATE INDEX idx_records_tenant_stage ON records (tenant_id, current_stage_id);

-- ── record_relationships ─────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_record_relationships_source_record_id;
DROP INDEX IF EXISTS idx_record_relationships_target_record_id;
DROP INDEX IF EXISTS idx_record_relationships_relationship_id;
CREATE INDEX idx_record_relationships_tenant_source ON record_relationships (tenant_id, source_record_id);
CREATE INDEX idx_record_relationships_tenant_target ON record_relationships (tenant_id, target_record_id);
CREATE INDEX idx_record_relationships_tenant_relationship ON record_relationships (tenant_id, relationship_id);

-- ── object_permissions ───────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_object_permissions_object_role;
CREATE INDEX idx_object_permissions_tenant_object_role ON object_permissions (tenant_id, object_id, role);

-- ── teams ────────────────────────────────────────────────────────────────────
CREATE INDEX idx_teams_tenant ON teams (tenant_id);

-- ── team_members ─────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_team_members_user_id;
DROP INDEX IF EXISTS idx_team_members_team_id;
CREATE INDEX idx_team_members_tenant_user ON team_members (tenant_id, user_id);
CREATE INDEX idx_team_members_tenant_team ON team_members (tenant_id, team_id);

-- ── lead_conversion_mappings ─────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_lead_conversion_mappings_target_object;
CREATE INDEX idx_lead_conversion_mappings_tenant_target ON lead_conversion_mappings (tenant_id, target_object);
