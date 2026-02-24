from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        MANAGER = 'manager', 'Manager'
        SUPERVISOR = 'supervisor', 'Supervisor'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.SUPERVISOR,
    )
    phone = models.CharField(max_length=15, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"

    # Convenience properties
    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_manager(self):
        return self.role == self.Role.MANAGER

    @property
    def is_supervisor(self):
        return self.role == self.Role.SUPERVISOR
