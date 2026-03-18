-- Migration: 015_add_sort_order_to_object_definitions
-- Description: Adds a sort_order column to object_definitions to support
--              user-defined ordering of object tabs in the navigation bar.

ALTER TABLE object_definitions
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows so system objects appear first (by created_at),
-- then custom objects.
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY is_system DESC, created_at ASC) AS rn
    FROM object_definitions
)
UPDATE object_definitions od
SET sort_order = numbered.rn
FROM numbered
WHERE od.id = numbered.id;

CREATE INDEX idx_object_definitions_sort_order ON object_definitions (sort_order);
