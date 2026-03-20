-- Migration: 018_add_record_owner_and_modifier_names
-- Description: Adds columns to track who last modified a record and store
--              display names for owner and modifier so we can show them in
--              the UI without extra API calls.

ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
ALTER TABLE records ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);
ALTER TABLE records ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(255);
