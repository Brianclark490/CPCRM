-- TEST-ONLY: deliberate schema drift to verify the Phase 4 CI check (issue #446).
--
-- This migration adds a throwaway column to `accounts`. The PR that contains
-- it intentionally does NOT regenerate apps/api/src/db/kysely.types.ts, so the
-- new "Kysely types are in sync with migrations" CI job should fail red.
--
-- DO NOT MERGE. The branch + PR are deleted/closed once the check is proven.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS drift_check_column TEXT;
