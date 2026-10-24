import os
import sys
from django.apps import AppConfig


class LiftLicenseConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.lift_license'
    verbose_name = 'Lift License Tracker'

    def ready(self):
        # Do not start scheduler for one-off CLI commands
        ignored_commands = ['migrate', 'makemigrations', 'collectstatic', 'shell', 'seed_lifts', 'showmigrations']
        if any(cmd in sys.argv for cmd in ignored_commands):
            return

        # In development runserver, only run inside the reloader child process
        if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') != 'true':
            return

        self._start_daily_alert_scheduler()

    def _start_daily_alert_scheduler(self):
        import threading
        import time

        def _scheduler_loop():
            # Wait 10s for the server to finish starting up
            time.sleep(10)
            while True:
                try:
                    from .email_service import check_and_send_daily_alerts
                    check_and_send_daily_alerts()
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Automatic lift alert scheduler error: {e}")
                # Check every hour
                time.sleep(3600)

        scheduler_thread = threading.Thread(
            target=_scheduler_loop,
            daemon=True,
            name="AutomatedLiftAlertScheduler"
        )
        scheduler_thread.start()
