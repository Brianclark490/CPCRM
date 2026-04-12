-- Migration: 025_enable_row_level_security
-- Description: Enables Postgres Row-Level Security (RLS) on all tenant-scoped
--              tables as defense-in-depth for tenant isolation (Issue #367).
--
--              Two permissive policies are created per table:
--
--              1. tenant_isolation — allows access only when the session variable
--                 app.current_tenant_id matches the row's tenant_id.
--              2. tenant_isolation_bypass — allows unrestricted access when no
--                 tenant context is set (migrations, admin scripts, seed jobs).
--
--              Because both policies are PERMISSIVE, PostgreSQL OR's them:
--                • App request with tenant context → only matching rows visible.
--                • Migration / admin (no context)  → all rows visible.
--
--              FORCE ROW LEVEL SECURITY is applied so policies are enforced even
--              when the connecting role owns the tables.
--
--              The application layer (TenantScopedClient) calls
--                SELECT set_config('app.current_tenant_id', $1, true)
--              at the start of each request, making the tenant context available
--              to the RLS policy via current_setting().
--
-- Depends on: 017_add_tenant_id_to_all_tables
--             019_page_layouts
--             021_sales_targets
--
-- Reversibility: To reverse, run:
--   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS tenant_isolation ON <table>;
--   DROP POLICY IF EXISTS tenant_isolation_bypass ON <table>;
--   for each table listed below.

-- ══════════════════════════════════════════════════════════════════════════════
-- Helper: creates the two standard RLS policies on a tenant-scoped table.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _enable_tenant_rls(p_table regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Enable RLS (idempotent — safe to call on an already-enabled table)
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);

  -- Policy 1: restrict to the current tenant when a context is set
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s '
    'USING (tenant_id = current_setting(''app.current_tenant_id'', true))',
    p_table
  );

  -- Policy 2: allow full access when no tenant context is set (migrations, seeds)
  EXECUTE format(
    'CREATE POLICY tenant_isolation_bypass ON %s '
    'USING (current_setting(''app.current_tenant_id'', true) IS NULL '
    'OR current_setting(''app.current_tenant_id'', true) = '''')',
    p_table
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Apply RLS to all 22 tenant-scoped tables
-- ══════════════════════════════════════════════════════════════════════════════

-- Core CRM entities (from 001_initial_schema / 003)
SELECT _enable_tenant_rls('accounts');
SELECT _enable_tenant_rls('contacts');
SELECT _enable_tenant_rls('opportunities');
SELECT _enable_tenant_rls('organisations');

-- Metadata / definitions (from 006 / 007 / 009 + 017)
SELECT _enable_tenant_rls('object_definitions');
SELECT _enable_tenant_rls('field_definitions');
SELECT _enable_tenant_rls('relationship_definitions');
SELECT _enable_tenant_rls('layout_definitions');
SELECT _enable_tenant_rls('layout_fields');

-- Pipeline (from 013 + 017)
SELECT _enable_tenant_rls('pipeline_definitions');
SELECT _enable_tenant_rls('stage_definitions');
SELECT _enable_tenant_rls('stage_gates');
SELECT _enable_tenant_rls('stage_history');

-- Data records (from 008 + 017)
SELECT _enable_tenant_rls('records');
SELECT _enable_tenant_rls('record_relationships');

-- Permissions & teams (from 016 + 017)
SELECT _enable_tenant_rls('object_permissions');
SELECT _enable_tenant_rls('teams');
SELECT _enable_tenant_rls('team_members');

-- Lead conversion (from 012 + 017)
SELECT _enable_tenant_rls('lead_conversion_mappings');

-- Page layouts (from 019)
SELECT _enable_tenant_rls('page_layouts');
SELECT _enable_tenant_rls('page_layout_versions');

-- Sales targets (from 021)
SELECT _enable_tenant_rls('sales_targets');

-- ══════════════════════════════════════════════════════════════════════════════
-- Clean up the helper function — it is not needed at runtime
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION _enable_tenant_rls(regclass);
