 #!/bin/bash
# Runs automatically by cron every day at 2:00 AM inside the backend container.
# Deletes photos from records older than 50 days.

set -e

cd /app

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting photo cleanup..."

python manage.py cleanup_old_photos --days 50

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Photo cleanup finished."