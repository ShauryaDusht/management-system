import re

from django.contrib.auth.models import AbstractUser
from django.db import models


USERNAME_RE = re.compile(r'^[a-z]+[a-z0-9]*\.[a-z]+[a-z0-9]*$')
FIRST_NAME_SUFFIXES = ('chandra', 'kumar', 'sinh', 'bhai')


def normalize_username_value(username):
    return re.sub(r'\s+', '', (username or '').strip().lower())


def build_username_from_names(first_name, last_name):
    # Portal usernames follow the supervisor convention:
    # first token of first_name + "." + surname, e.g. "Ashokbhai Ishwarbhai Rathod"
    # becomes "ashok.rathod". Duplicate handling appends a numeric suffix.
    first_parts = re.findall(r'[a-z0-9]+', (first_name or '').strip().lower())
    first = first_parts[0] if first_parts else ''
    for suffix in FIRST_NAME_SUFFIXES:
        if first.endswith(suffix) and len(first) > len(suffix) + 1:
            first = first[:-len(suffix)]
            break
    last_parts = re.findall(r'[a-z0-9]+', (last_name or '').strip().lower())
    last = last_parts[-1] if last_parts else ''
    return f'{first}.{last}' if first and last else ''


def is_standard_username(username):
    return bool(USERNAME_RE.fullmatch(username or ''))


def split_full_name(full_name):
    parts = (full_name or '').strip().split()
    if not parts:
        return '', ''
    if len(parts) == 1:
        return parts[0], ''
    return ' '.join(parts[:-1]), parts[-1]


def unique_standard_username(first_name, last_name, *, model=None, exclude_pk=None, reserved=None):
    base = build_username_from_names(first_name, last_name)
    if not base:
        return ''

    if model is None:
        model = User

    first, last = base.split('.', 1)
    reserved = set(reserved or [])
    candidate = base
    suffix = 2
    while True:
        qs = model.objects.filter(username=candidate)
        if exclude_pk is not None:
            qs = qs.exclude(pk=exclude_pk)
        if candidate not in reserved and not qs.exists():
            return candidate
        candidate = f'{first}.{last}{suffix}'
        suffix += 1


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        INVENTORY_MANAGER = 'inventory_manager', 'Inventory Manager'
        HOUSEKEEPING_MANAGER = 'housekeeping_manager', 'Housekeeping Manager'
        HORTICULTURE_MANAGER = 'horticulture_manager', 'Horticulture Manager'
        SUPERVISOR = 'supervisor', 'Supervisor'
        CARETAKER = 'caretaker', 'Caretaker'

    role = models.CharField(max_length=25, choices=Role.choices, default=Role.SUPERVISOR)
    phone = models.CharField(max_length=15, blank=True)
    pay_code = models.CharField(max_length=20, blank=True)
    profile_photo = models.ImageField(upload_to='users/photos/', null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def clean(self):
        super().clean()
        self.username = normalize_username_value(self.username)

    def save(self, *args, **kwargs):
        self.username = normalize_username_value(self.username)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def is_inventory_manager(self):
        return self.role == self.Role.INVENTORY_MANAGER

    @property
    def is_housekeeping_manager(self):
        return self.role == self.Role.HOUSEKEEPING_MANAGER

    @property
    def is_horticulture_manager(self):
        return self.role == self.Role.HORTICULTURE_MANAGER

    @property
    def is_any_manager(self):
        return self.role in (
            self.Role.INVENTORY_MANAGER,
            self.Role.HOUSEKEEPING_MANAGER,
            self.Role.HORTICULTURE_MANAGER,
        )

    @property
    def is_manager(self):
        # Backward-compat alias - treat any domain manager like a manager
        return self.is_any_manager

    @property
    def is_supervisor(self):
        return self.role == self.Role.SUPERVISOR

    @property
    def is_caretaker(self):
        return self.role == self.Role.CARETAKER

    @property
    def is_hk_staff(self):
        return self.role in [self.Role.SUPERVISOR, self.Role.CARETAKER]

