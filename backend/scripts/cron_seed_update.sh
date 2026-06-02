#!/bin/bash
# Runs weekly inside the backend container.
# Creates a database backup before refreshing seed-managed data.
# The database remains online throughout the process.

set -e
set -u

cd /app

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_DIR="/app/backups"
BACKUP_FILE="${BACKUP_DIR}/db_backup_before_seed_${TIMESTAMP}.json"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "${LOG_PREFIX} ============================================"
echo "${LOG_PREFIX} Starting weekly seed update..."
echo "${LOG_PREFIX} ============================================"

mkdir -p "${BACKUP_DIR}"

echo "${LOG_PREFIX} Creating backup -> ${BACKUP_FILE}"
python manage.py dumpdata \
    --natural-foreign \
    --natural-primary \
    --exclude=contenttypes \
    --exclude=auth.permission \
    --indent 2 \
    --output "${BACKUP_FILE}"

echo "${LOG_PREFIX} Backup complete ($(du -sh "${BACKUP_FILE}" | cut -f1))"

echo "${LOG_PREFIX} Pruning old backups (keeping last 8)..."
ls -1t "${BACKUP_DIR}"/db_backup_before_seed_*.json 2>/dev/null \
    | tail -n +9 \
    | xargs -r rm --
echo "${LOG_PREFIX} Pruning done."

echo "${LOG_PREFIX} Running migrations..."
python manage.py migrate --noinput -v 0

echo "${LOG_PREFIX} Syncing seed-managed data..."
python manage.py update_inventory_items -v 0
python manage.py sync_real_inventory_stock --quiet
python manage.py sync_monthly_purchase_plans --quiet
python manage.py update_pay_codes --quiet
python manage.py update_names --quiet
python manage.py sync_guesthouse_director_staff --quiet
python manage.py seed_housekeeping -v 0
python manage.py seed_horticulture

echo "${LOG_PREFIX} ============================================"
echo "${LOG_PREFIX} Weekly seed update complete."
echo "${LOG_PREFIX} ============================================"
