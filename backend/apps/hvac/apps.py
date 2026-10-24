from django.apps import AppConfig


class HvacConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.hvac'
    verbose_name = 'HVAC Plant Telemetry & Logs'
