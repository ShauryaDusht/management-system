#!/bin/bash
# Run "python manage.py <command>" from a cron job.
#
# Cron starts jobs with a nearly empty environment: no /usr/local/bin in PATH (so "python" is not found) and none of
# the container's settings (database, secret key, ...). This loads both from the container's main process first.
#
# Usage: bash /app/scripts/run_manage.sh <command> [arguments]

export PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

while IFS= read -r -d '' entry; do
    case "$entry" in
        PATH=*|PWD=*|OLDPWD=*|SHLVL=*|_=*) ;;
        *) export "$entry" ;;
    esac
done < /proc/1/environ

cd /app || exit 1
exec python manage.py "$@"
