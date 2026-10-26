import os
import sys
import threading
import time
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        # Prevent scheduler thread from running during management utilities or multiple times in dev
        disallowed = {'makemigrations', 'migrate', 'collectstatic', 'test', 'shell'}
        if any(cmd in sys.argv for cmd in disallowed):
            return

        is_runserver = 'runserver' in sys.argv
        if is_runserver and os.environ.get('RUN_MAIN') != 'true':
            # Skip parent reloader process in runserver
            return

        # Start the background reminder scheduler thread
        self._start_reminder_scheduler()

    def _start_reminder_scheduler(self):
        def _loop():
            # Initial slight delay to let Django fully initialize
            time.sleep(5)
            while True:
                try:
                    from django.db import connection
                    try:
                        from apps.core.notifications import check_and_send_usage_reminders
                        check_and_send_usage_reminders()
                    finally:
                        connection.close()
                except Exception:
                    pass
                # Check every 60 seconds
                time.sleep(60)

        thread = threading.Thread(target=_loop, name='UsageReminderDaemon', daemon=True)
        thread.start()