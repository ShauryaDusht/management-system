#!/bin/bash
# Optionally restore a PostgreSQL SQL/custom backup before Django migrations.
set -e
set -u

RESTORE_SQL_BACKUP_ON_STARTUP="${RESTORE_SQL_BACKUP_ON_STARTUP:-false}"
SQL_RESTORE_FORCE="${SQL_RESTORE_FORCE:-false}"
SQL_RESTORE_FILE="${SQL_RESTORE_FILE:-}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
DB_NAME="${DB_NAME:-inventory_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

if [ "${RESTORE_SQL_BACKUP_ON_STARTUP}" != "true" ]; then
    printf '%s\n' "SQL backup restore skipped (RESTORE_SQL_BACKUP_ON_STARTUP is not true)."
    exit 0
fi

mkdir -p "${BACKUP_DIR}"

if [ -z "${SQL_RESTORE_FILE}" ]; then
    SQL_RESTORE_FILE="$(
        find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name '*.sql' -o -name '*.dump' \) \
            | sort -r \
            | head -n 1
    )"
fi

if [ -z "${SQL_RESTORE_FILE}" ]; then
    printf '%s\n' "SQL backup restore requested, but no .sql/.dump file was found in ${BACKUP_DIR}."
    exit 1
fi

if [ ! -f "${SQL_RESTORE_FILE}" ]; then
    printf '%s\n' "SQL backup restore file not found: ${SQL_RESTORE_FILE}"
    exit 1
fi

table_count="$(
    PGPASSWORD="${DB_PASSWORD:-}" psql \
        --host="${DB_HOST}" \
        --port="${DB_PORT}" \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --tuples-only \
        --no-align \
        --command="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
)"

if [ "${table_count}" != "0" ] && [ "${SQL_RESTORE_FORCE}" != "true" ]; then
    printf '%s\n' "SQL backup restore skipped: database already has ${table_count} public tables."
    printf '%s\n' "Set SQL_RESTORE_FORCE=true for a one-time destructive restore."
    exit 0
fi

printf '%s\n' "Restoring database from backup: ${SQL_RESTORE_FILE}"

if [ "${SQL_RESTORE_FORCE}" = "true" ]; then
    printf '%s\n' "SQL_RESTORE_FORCE=true: dropping and recreating public schema before restore."
    PGPASSWORD="${DB_PASSWORD:-}" psql \
        --host="${DB_HOST}" \
        --port="${DB_PORT}" \
        --username="${DB_USER}" \
        --dbname="${DB_NAME}" \
        --command="DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
fi

case "${SQL_RESTORE_FILE}" in
    *.dump)
        PGPASSWORD="${DB_PASSWORD:-}" pg_restore \
            --host="${DB_HOST}" \
            --port="${DB_PORT}" \
            --username="${DB_USER}" \
            --dbname="${DB_NAME}" \
            --no-owner \
            --verbose \
            "${SQL_RESTORE_FILE}"
        ;;
    *)
        PGPASSWORD="${DB_PASSWORD:-}" psql \
            --host="${DB_HOST}" \
            --port="${DB_PORT}" \
            --username="${DB_USER}" \
            --dbname="${DB_NAME}" \
            --set=ON_ERROR_STOP=1 \
            --file="${SQL_RESTORE_FILE}"
        ;;
esac

printf '%s\n' "SQL backup restore complete."
