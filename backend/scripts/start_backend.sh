#!/bin/bash
# Docker bootstrap — runs migrations, seeds data, sets up cron, then starts Gunicorn.
set -e
set -u

printf '%s\n' "Collecting static files..."
python manage.py collectstatic --noinput -v 0

printf '%s\n' "Checking optional SQL backup restore..."
bash /app/scripts/restore_sql_backup.sh

printf '%s\n' "Applying database migrations..."
python manage.py migrate --noinput -v 0
python manage.py ensure_portal_logins -v 0

RUN_SEED_ON_STARTUP="${RUN_SEED_ON_STARTUP:-false}"
RUN_DATA_SYNC_ON_STARTUP="${RUN_DATA_SYNC_ON_STARTUP:-false}"

printf '%s\n' "Checking baseline data..."
python manage.py seed_all_data_if_empty -v 0

if [ "${RUN_DATA_SYNC_ON_STARTUP}" = "true" ]; then
    printf '%s\n' "Running opt-in data sync commands..."
    python manage.py update_inventory_items -v 0
    python manage.py sync_real_inventory_stock --quiet
    python manage.py sync_monthly_purchase_plans --quiet
    python manage.py update_pay_codes --quiet
    python manage.py update_names --quiet
    python manage.py sync_guesthouse_director_staff --quiet
else
    printf '%s\n' "Skipping data sync commands (RUN_DATA_SYNC_ON_STARTUP is not true)."
fi

if [ "${RUN_SEED_ON_STARTUP}" = "true" ]; then
    printf '%s\n' "Running opt-in seed refresh commands..."
    python manage.py seed_housekeeping -v 0
    python manage.py seed_horticulture
else
    printf '%s\n' "Skipping seed refresh commands (RUN_SEED_ON_STARTUP is not true)."
fi

printf '%s\n' "Setting up cron jobs..."
mkdir -p /app/backups
mkdir -p /app/backups/logs

chmod +x /app/scripts/cron_cleanup.sh
chmod +x /app/scripts/cron_seed_update.sh
chmod +x /app/scripts/cron_lift_alerts.sh
chmod +x /app/scripts/backup_database.sh
chmod +x /app/scripts/restore_sql_backup.sh

# /etc/cron.d entries require an explicit user field.
echo "0 2 * * * root /app/scripts/cron_cleanup.sh >> /app/backups/logs/photo_cleanup.log 2>&1" \
    > /etc/cron.d/photo-cleanup
echo "0 3 * * 0 root /app/scripts/cron_seed_update.sh >> /app/backups/logs/seed_update.log 2>&1" \
    > /etc/cron.d/seed-update
echo "0 8 * * * root /app/scripts/cron_lift_alerts.sh >> /app/backups/logs/lift_alerts.log 2>&1" \
    > /etc/cron.d/lift-alerts

chmod 0644 /etc/cron.d/photo-cleanup /etc/cron.d/seed-update /etc/cron.d/lift-alerts
cron
printf '%s\n' "Cron started (daily cleanup @ 2 AM, weekly seed update @ Sun 3 AM, daily lift alerts @ 8 AM)."

printf '%s\n' "Starting Gunicorn..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
