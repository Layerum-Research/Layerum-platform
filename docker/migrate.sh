#!/bin/sh
set -eu

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS layerum_internal;
REVOKE ALL ON SCHEMA layerum_internal FROM PUBLIC;
CREATE TABLE IF NOT EXISTS layerum_internal.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

for file in /migrations/*.sql; do
  name=$(basename "$file")
  applied=$(psql "$DATABASE_URL" -tA -v name="$name" <<'SQL'
SELECT 1 FROM layerum_internal.schema_migrations WHERE name = :'name';
SQL
)
  [ "$applied" = "1" ] && continue

  echo "Applying $name"
  {
    cat "$file"
    printf '\nINSERT INTO layerum_internal.schema_migrations (name) VALUES (%s);\n' "'$name'"
  } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -v workspace_limit="${WORKSPACE_LIMIT:-1000}" \
  -v capacity_gb="${STORAGE_CAPACITY_GB:-1000000}" <<'SQL'
UPDATE public.subscription_plans
SET workspace_limit = :workspace_limit,
    capacity_bytes = :capacity_gb::bigint * 1024 * 1024 * 1024
WHERE code = 'free';
SQL

echo "Database is up to date"
