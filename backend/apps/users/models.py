import re

from django.contrib.auth.models import AbstractUser
from django.db import models


USERNAME_RE = re.compile(r'^[a-z]+[a-z0-9]*\.[a-z]+[a-z0-9]*$')


def normalize_username_value(username):
    return re.sub(r'\s+', '', (username or '').strip().lower())


def build_username_from_names(first_name, last_name):
    first = re.sub(r'[^a-z0-9]', '', (first_name or '').strip().lower())
    last_parts = re.findall(r'[a-z0-9]+', (last_name or '').strip().lower())
    last = last_parts[-1] if last_parts else ''
    return f'{first}.{last}' if first and last else ''


def is_standard_username(username):
    return bool(USERNAME_RE.fullmatch(username or ''))


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

