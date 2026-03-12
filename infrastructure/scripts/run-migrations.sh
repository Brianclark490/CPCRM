#!/usr/bin/env bash
# run-migrations.sh
#
# Applies pending SQL migrations to the target PostgreSQL database in order.
# Tracks applied migrations in a schema_migrations table so re-runs are safe.
#
# Prerequisites:
#   - psql CLI installed  (apt-get install postgresql-client)
#   - DATABASE_URL env var set to a valid PostgreSQL connection string
#     e.g. postgresql://user:password@host:5432/dbname?sslmode=require
#
# Usage:
#   export DATABASE_URL="postgresql://..."
#   bash infrastructure/scripts/run-migrations.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../../apps/api/src/db/migrations"

# ── Validate prerequisites ────────────────────────────────────────────────────

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL environment variable is not set." >&2
  echo "  Export it before running this script:" >&2
  echo "    export DATABASE_URL='postgresql://user:pass@host/dbname?sslmode=require'" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql is not installed. Install it with: apt-get install postgresql-client" >&2
  exit 1
fi

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  echo "ERROR: Migrations directory not found: ${MIGRATIONS_DIR}" >&2
  exit 1
fi

# ── Bootstrap migration tracking table ───────────────────────────────────────

echo "==> Ensuring schema_migrations tracking table exists..."
psql "${DATABASE_URL}" --no-psqlrc -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# ── Apply pending migrations in sorted order ──────────────────────────────────

echo "==> Checking for pending migrations in ${MIGRATIONS_DIR}..."

applied_count=0
shopt -s nullglob

for migration_file in $(ls "${MIGRATIONS_DIR}"/*.sql 2>/dev/null | sort); do
  filename="$(basename "${migration_file}")"

  # Guard: only allow filenames matching the expected NNN_description.sql pattern
  if [[ ! "${filename}" =~ ^[0-9]{3}_[a-zA-Z0-9_-]+\.sql$ ]]; then
    echo "    WARNING: Skipping file with unexpected name: ${filename}" >&2
    continue
  fi

  # Check whether this migration has already been applied
  count=$(psql "${DATABASE_URL}" --no-psqlrc -t -A \
    -v "migration_filename=${filename}" \
    -c "SELECT COUNT(*) FROM schema_migrations WHERE filename = :'migration_filename'" \
    2>/dev/null)

  if [[ "${count:-0}" -gt 0 ]]; then
    echo "    Skipping (already applied): ${filename}"
    continue
  fi

  echo "    Applying: ${filename}"
  psql "${DATABASE_URL}" --no-psqlrc -v ON_ERROR_STOP=1 -f "${migration_file}"
  psql "${DATABASE_URL}" --no-psqlrc -v ON_ERROR_STOP=1 \
    -v "migration_filename=${filename}" \
    -c "INSERT INTO schema_migrations (filename) VALUES (:'migration_filename')"
  echo "    Applied:  ${filename}"
  applied_count=$((applied_count + 1))
done

echo "==> Done. Applied ${applied_count} migration(s)."
