#!/bin/bash
# Automatically checks 30, 60, and 90 days lift license alerts and dispatches emails
set -e
cd /app
python manage.py send_lift_expiry_alerts >> /app/backups/logs/lift_alerts.log 2>&1
