#!/bin/bash
# Runs automatically by cron inside the backend container shortly after 10 PM IST.
# Records Absent for Hostel Common Area staff nobody marked by the end of the second shift.

set -e

cd /app

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Recording unmarked Hostel Common Area staff as absent..."

python manage.py auto_absent_common_area

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done."
