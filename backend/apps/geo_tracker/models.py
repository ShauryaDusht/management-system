from django.db import models
from django.utils import timezone


class PlantType(models.TextChoices):
    TREE = 'tree', 'Tree'
    PLANT = 'plant', 'Plant'
    SHRUB = 'shrub', 'Shrub'


class PlantVariety(models.Model):
    name = models.CharField(max_length=200)
    plant_type = models.CharField(max_length=10, choices=PlantType.choices)
    scientific_name = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['plant_type', 'name']
        verbose_name_plural = 'Plant varieties'

    def __str__(self):
        return f"{self.name} ({self.get_plant_type_display()})"


class PlantRecord(models.Model):
    # Core identification
    plant_type = models.CharField(max_length=10, choices=PlantType.choices)
    local_name = models.CharField(max_length=200)
    scientific_name = models.CharField(max_length=200, blank=True)
    variety = models.ForeignKey(
        PlantVariety,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='records',
    )

    # Location
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    zone = models.CharField(max_length=100, blank=True, help_text='Zone name or code')
    location_notes = models.CharField(max_length=300, blank=True)

    # Physical measurements
    height_m = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        help_text='Height in metres'
    )
    girth_cm = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text='Girth/circumference at breast height in centimetres'
    )
    canopy_spread_m = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        help_text='Canopy spread in metres'
    )

    # Condition / status
    CONDITION_CHOICES = [
        ('excellent', 'Excellent'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('dead', 'Dead'),
    ]
    condition = models.CharField(
        max_length=20, choices=CONDITION_CHOICES, default='good'
    )

    # Photo
    photo = models.ImageField(upload_to='geo_tracker/photos/', null=True, blank=True)

    # Metadata
    notes = models.TextField(blank=True)
    submitted_by = models.CharField(max_length=200, help_text='Staff name or ID')
    submitted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f"{self.local_name} ({self.get_plant_type_display()}) — {self.zone or 'No zone'}"

    @property
    def lat(self):
        return float(self.latitude)

    @property
    def lng(self):
        return float(self.longitude)
