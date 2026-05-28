import re

from django.db import migrations


USERNAME_RE = re.compile(r'^[a-z]+[a-z0-9]*\.[a-z]+[a-z0-9]*$')
FIRST_NAME_SUFFIXES = ('chandra', 'kumar', 'sinh', 'bhai')


def _username_from_names(first_name, last_name):
    first_parts = re.findall(r'[a-z0-9]+', (first_name or '').strip().lower())
    first = first_parts[0] if first_parts else ''
    for suffix in FIRST_NAME_SUFFIXES:
        if first.endswith(suffix) and len(first) > len(suffix) + 1:
            first = first[:-len(suffix)]
            break
    last_parts = re.findall(r'[a-z0-9]+', (last_name or '').strip().lower())
    last = last_parts[-1] if last_parts else ''
    return f'{first}.{last}' if first and last else ''


def _unique_username(base, used):
    if not base:
        return ''
    first, last = base.split('.', 1)
    candidate = base
    suffix = 2
    while candidate in used:
        candidate = f'{first}.{last}{suffix}'
        suffix += 1
    used.add(candidate)
    return candidate


def standardize_usernames(apps, schema_editor):
    User = apps.get_model('users', 'User')
    users = list(User.objects.order_by('id'))
    used = {
        (user.username or '').strip().lower()
        for user in users
        if USERNAME_RE.fullmatch((user.username or '').strip().lower())
    }

    for user in users:
        first_name = user.first_name or ''
        last_name = user.last_name or ''
        if user.role == 'admin' and not last_name:
            last_name = 'User'

        base = _username_from_names(first_name, last_name)
        current = (user.username or '').strip().lower()
        if current == base and current in used:
            continue
        if current in used:
            used.remove(current)

        target = _unique_username(base, used)
        if not target:
            if current and USERNAME_RE.fullmatch(current):
                used.add(current)
            continue

        update_fields = ['username']
        user.username = target
        if user.role == 'admin' and not user.last_name:
            user.last_name = last_name
            update_fields.append('last_name')
        user.save(update_fields=update_fields)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial_squashed_0006_populate_pay_codes_and_names'),
    ]

    operations = [
        migrations.RunPython(standardize_usernames, migrations.RunPython.noop),
    ]
