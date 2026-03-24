-- Migration: 021_sales_targets
-- Description: Sales target tracking table. Targets can be set at business,
--              team, or user level for monthly/quarterly/annual periods.
--              Actuals are NOT stored — they are calculated in real-time from
--              Closed Won opportunities.
--
-- Depends on: 017_add_tenant_id_to_all_tables (tenant_id columns)

CREATE TABLE IF NOT EXISTS sales_targets (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         VARCHAR(255)   NOT NULL REFERENCES tenants(id),
    target_type       VARCHAR(20)    NOT NULL,
    target_entity_id  UUID,
    period_type       VARCHAR(20)    NOT NULL,
    period_start      DATE           NOT NULL,
    period_end        DATE           NOT NULL,
    target_value      DECIMAL(15,2)  NOT NULL,
    currency          VARCHAR(3)     DEFAULT 'GBP',
    created_at        TIMESTAMPTZ    DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE(tenant_id, target_type, target_entity_id, period_start),
    CONSTRAINT chk_target_type CHECK (target_type IN ('business', 'team', 'user')),
    CONSTRAINT chk_period_type CHECK (period_type IN ('monthly', 'quarterly', 'annual')),
    CONSTRAINT chk_period_range CHECK (period_end > period_start),
    CONSTRAINT chk_target_value_positive CHECK (target_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_tenant_id ON sales_targets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_tenant_period ON sales_targets (tenant_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_sales_targets_tenant_type ON sales_targets (tenant_id, target_type);
