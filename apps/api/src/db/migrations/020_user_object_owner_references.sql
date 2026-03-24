-- Migration: 020_user_object_owner_references
-- Description: Adds nullable UUID columns to the records table that reference
--              User records, enabling clickable owner/modifier links in the UI.
--              The User system object is seeded by seedDefaultObjects; this
--              migration only adds the structural columns for the FK reference.

ALTER TABLE records ADD COLUMN IF NOT EXISTS owner_record_id UUID;
ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_by_record_id UUID;

CREATE INDEX IF NOT EXISTS idx_records_owner_record_id ON records (owner_record_id);
CREATE INDEX IF NOT EXISTS idx_records_updated_by_record_id ON records (updated_by_record_id);
