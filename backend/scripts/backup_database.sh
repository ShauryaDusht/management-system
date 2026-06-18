#!/bin/bash
# Create a timestamped PostgreSQL backup under /app/backups.
set -e
set -u

BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
DB_NAME="${DB_NAME:-inventory_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_FILE="${BACKUP_DIR}/postgres_${DB_NAME}_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "Creating PostgreSQL backup: ${BACKUP_FILE}"
PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --format=custom \
    --blobs \
    --verbose \
    --file="${BACKUP_FILE}" \
    "${DB_NAME}"

sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"
echo "Backup complete: ${BACKUP_FILE}"

echo "Pruning old SQL backups (keeping last 10)..."
ls -1t "${BACKUP_DIR}"/postgres_${DB_NAME}_*.dump 2>/dev/null \
    | tail -n +11 \
    | xargs -r rm -f --
ls -1t "${BACKUP_DIR}"/postgres_${DB_NAME}_*.dump.sha256 2>/dev/null \
    | tail -n +11 \
    | xargs -r rm -f --
echo "Pruning done."