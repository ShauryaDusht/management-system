from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        INVENTORY_MANAGER = 'inventory_manager', 'Inventory Manager'
        MANAGER = 'manager', 'Manager'
        SUPERVISOR = 'supervisor', 'Supervisor'
        CARETAKER = 'caretaker', 'Caretaker'

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SUPERVISOR)
    phone = models.CharField(max_length=15, blank=True)
    profile_photo = models.ImageField(upload_to='users/photos/', null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
<<<<<<< HEAD
    def is_hk_staff(self):
        return self.role in [self.Role.SUPERVISOR, self.Role.CARETAKER]
=======
    def is_inventory_manager(self):
        return self.role == self.Role.INVENTORY_MANAGER

    @property
    def is_inventory_manager(self):
        return self.role == self.Role.INVENTORY_MANAGER

    @property
    def is_manager(self):
        # using user.is_manager work correctly for both manager roles
        return self.role in (self.Role.MANAGER, self.Role.INVENTORY_MANAGER)

    @property
    def is_supervisor(self):
        return self.role == self.Role.SUPERVISOR
>>>>>>> e770440a1f4429d9845884131c9746d211c7b496
