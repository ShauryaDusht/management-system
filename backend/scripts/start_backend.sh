#!/bin/bash
# Docker bootstrap — runs migrations, seeds data, sets up cron, then starts Gunicorn.
set -e
set -u

printf '%s\n' "Applying database migrations..."
python manage.py migrate --noinput -v 0

printf '%s\n' "Syncing baseline data..."
python manage.py seed_all_data_if_empty -v 0
python manage.py seed_housekeeping -v 0
python manage.py update_inventory_items -v 0
python manage.py sync_real_inventory_stock --quiet
python manage.py sync_monthly_purchase_plans --quiet
python manage.py update_pay_codes --quiet
python manage.py update_names --quiet
python manage.py sync_guesthouse_director_staff --quiet

printf '%s\n' "Collecting static files..."
python manage.py collectstatic --noinput -v 0

printf '%s\n' "Setting up cron job for photo cleanup..."
chmod +x /app/scripts/cron_cleanup.sh
# Run cleanup_old_photos every day at 2:00 AM
echo "0 2 * * * /app/scripts/cron_cleanup.sh >> /var/log/photo_cleanup.log 2>&1" | crontab -
cron

printf '%s\n' "Starting Gunicorn..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -