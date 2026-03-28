-- Migration: 022_user_descope_index
-- Description: Adds a partial index on records.field_values->>'descope_user_id'
--              so that User record lookups by Descope ID (used on every
--              authenticated request) are fast.

CREATE INDEX IF NOT EXISTS idx_records_descope_user
ON records((field_values->>'descope_user_id'))
WHERE field_values->>'descope_user_id' IS NOT NULL;
