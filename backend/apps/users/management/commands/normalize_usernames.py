from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.users.models import User, build_username_from_names, is_standard_username, normalize_username_value


class Command(BaseCommand):
    help = 'Normalize user usernames to firstname.lastname without changing user primary keys.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write username changes. Defaults to dry run.')
        parser.add_argument('--include-admin', action='store_true', help='Also normalize admin/superuser accounts.')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        include_admin = options['include_admin']
        qs = User.objects.order_by('id')
        planned = []
        errors = []

        for user in qs:
            if not include_admin and (user.is_superuser or user.role == User.Role.ADMIN):
                continue
            current = normalize_username_value(user.username)
            target = build_username_from_names(user.first_name, user.last_name) or current
            if not is_standard_username(target):
                errors.append(f'{user.id}: cannot derive firstname.lastname for {user.username!r}')
                continue
            if target != current:
                planned.append((user, current, target))

        target_counts = {}
        for _user, _current, target in planned:
            target_counts[target] = target_counts.get(target, 0) + 1
        duplicates = sorted(target for target, count in target_counts.items() if count > 1)
        existing_conflicts = [
            target for _user, current, target in planned
            if target != current and User.objects.filter(username=target).exclude(username=current).exists()
        ]
        if duplicates or existing_conflicts:
            for target in duplicates:
                errors.append(f'duplicate generated username: {target}')
            for target in existing_conflicts:
                errors.append(f'target already exists: {target}')

        for user, current, target in planned:
            self.stdout.write(f'{"UPDATE" if apply_changes else "DRY"} user_id={user.id}: {current} -> {target}')

        if errors:
            for msg in errors:
                self.stderr.write(msg)
            raise CommandError('Username normalization blocked by validation errors.')

        if not apply_changes:
            self.stdout.write(self.style.WARNING(f'Dry run complete. {len(planned)} username changes pending.'))
            return

        with transaction.atomic():
            for user, _current, target in planned:
                user.username = target
                user.save(update_fields=['username'])

        self.stdout.write(self.style.SUCCESS(f'Updated {len(planned)} usernames.'))
