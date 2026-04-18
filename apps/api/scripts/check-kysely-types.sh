#!/usr/bin/env bash
#
# Verifies that apps/api/src/db/kysely.types.ts is in sync with the SQL
# migrations in apps/api/src/db/migrations/.
#
# Steps:
#   1. Apply every committed migration to the database identified by
#      $DATABASE_URL (CI provides a throwaway Postgres service container).
#   2. Run kysely-codegen against that database, writing to a temp file.
#   3. Diff the temp file against the committed kysely.types.ts.
#   4. Fail the build with an actionable message if they differ.
#
# Run locally (against a throwaway DB):
#   docker run --rm -d --name cpcrm-types-check \
#     -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:14
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
#     ./apps/api/scripts/check-kysely-types.sh
#   docker stop cpcrm-types-check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMITTED="$API_DIR/src/db/kysely.types.ts"
GENERATED="$(mktemp -t kysely-types.XXXXXX.ts)"
trap 'rm -f "$GENERATED"' EXIT

: "${DATABASE_URL:?DATABASE_URL must be set (e.g. postgres://postgres:postgres@localhost:5432/postgres)}"

echo "==> Applying migrations to throwaway database"
( cd "$API_DIR" && npm run --silent db:migrate )

echo "==> Generating Kysely types from live schema"
( cd "$API_DIR" && npx --no-install kysely-codegen \
    --dialect postgres \
    --url "$DATABASE_URL" \
    --out-file "$GENERATED" )

echo "==> Comparing generated types to committed file"
if diff -u "$COMMITTED" "$GENERATED"; then
  echo "✅ Kysely types match the migrations in this commit."
  exit 0
fi

cat <<'MSG' >&2

────────────────────────────────────────────────────────────────────────────────
❌ apps/api/src/db/kysely.types.ts is out of sync with the SQL migrations
   in apps/api/src/db/migrations/.

   This usually means a new migration was added without regenerating the
   Kysely types. To fix it locally:

       cd apps/api
       DATABASE_URL=postgres://...  npm run db:types
       git add src/db/kysely.types.ts

   Then commit the regenerated file in the same PR as the migration.
   See CONTRIBUTING.md → "Database migrations" for the full workflow.
────────────────────────────────────────────────────────────────────────────────
MSG
exit 1
