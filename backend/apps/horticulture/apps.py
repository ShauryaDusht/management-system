from django.apps import AppConfig


class HorticultureConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.horticulture"

    def ready(self):
        from . import signals  # noqa: F401
