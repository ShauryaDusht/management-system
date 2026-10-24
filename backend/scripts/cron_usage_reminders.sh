#!/bin/bash
# Runs automatically by cron inside the backend container to check and send 5 PM usage report reminders.

set -e

cd /app

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting 5 PM usage report reminder check..."

python manage.py send_usage_reminders

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 5 PM usage report reminder check finished."
