-- Migration: 019_page_layouts
-- Description: Page layouts with JSON-based layout structure, versioning,
--              and draft/published workflow.
--
-- Depends on: 006_metadata_schema (object_definitions)
--             017_add_tenant_id_to_all_tables (tenants)

-- ──────────────────────────────────────────────────────────────────────────────
-- Page Layouts
-- Each row describes a full page layout for a CRM object, including header,
-- tabs, sections, and component configuration stored as JSONB.
-- The `layout` column holds the working draft; `published_layout` holds the
-- live version that end-users see.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_layouts (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         VARCHAR(255)  NOT NULL REFERENCES tenants (id),
    object_id         UUID          NOT NULL REFERENCES object_definitions (id) ON DELETE CASCADE,
    name              VARCHAR(255)  NOT NULL,
    role              VARCHAR(100),
    is_default        BOOLEAN       NOT NULL DEFAULT false,
    layout            JSONB         NOT NULL,
    published_layout  JSONB,
    version           INTEGER       NOT NULL DEFAULT 1,
    status            VARCHAR(20)   NOT NULL DEFAULT 'draft',
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    published_at      TIMESTAMPTZ,
    UNIQUE (tenant_id, object_id, role)
);

CREATE INDEX IF NOT EXISTS idx_page_layouts_tenant_id ON page_layouts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_page_layouts_object_id ON page_layouts (object_id);
CREATE INDEX IF NOT EXISTS idx_page_layouts_status    ON page_layouts (status);

-- ──────────────────────────────────────────────────────────────────────────────
-- Page Layout Versions
-- Stores a snapshot of the layout JSONB each time it is published, providing
-- an audit trail and the ability to roll back to a previous version.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS page_layout_versions (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id      UUID          NOT NULL REFERENCES page_layouts (id) ON DELETE CASCADE,
    tenant_id      VARCHAR(255)  NOT NULL REFERENCES tenants (id),
    version        INTEGER       NOT NULL,
    layout         JSONB         NOT NULL,
    published_by   VARCHAR(255),
    published_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (layout_id, version)
);

CREATE INDEX IF NOT EXISTS idx_page_layout_versions_layout_id ON page_layout_versions (layout_id);
CREATE INDEX IF NOT EXISTS idx_page_layout_versions_tenant_id ON page_layout_versions (tenant_id);
