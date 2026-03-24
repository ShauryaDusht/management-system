#!/bin/bash
# Docker bootstrap for local and beta server startup.
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

exec python manage.py runserver 0.0.0.0:8000 --noreload
