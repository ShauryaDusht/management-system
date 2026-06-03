from django.apps import apps
from django.core.management.base import BaseCommand

from apps.users.models import User


REMOVED_USERNAMES = {'housekeeping.manager', 'hostel.manager'}


class Command(BaseCommand):
    help = 'Remove deprecated housekeeping_manager users and disable protected leftovers.'

    def handle(self, *args, **options):
        candidates = list(
            User.objects.filter(role='housekeeping_manager')
            | User.objects.filter(username__in=REMOVED_USERNAMES)
        )
        deleted = 0
        disabled = 0

        for user in candidates:
            if self._has_related_history(user):
                user.username = f'removed.hk.manager.{user.pk}'
                user.role = User.Role.HK_INVENTORY_MANAGER
                user.is_active = False
                user.is_staff = False
                user.is_superuser = False
                user.save(update_fields=['username', 'role', 'is_active', 'is_staff', 'is_superuser'])
                disabled += 1
                continue
            user.delete()
            deleted += 1

        self.stdout.write(self.style.SUCCESS(
            f'Housekeeping Manager cleanup complete: deleted {deleted}, disabled {disabled}.'
        ))

    def _has_related_history(self, user):
        for model in apps.get_models():
            for field in model._meta.get_fields():
                if not getattr(field, 'many_to_one', False) and not getattr(field, 'one_to_one', False):
                    continue
                remote = getattr(field, 'remote_field', None)
                if remote and remote.model is User:
                    if model.objects.filter(**{f'{field.name}_id': user.pk}).exists():
                        return True
        return False
