from django.db import IntegrityError, models
from django.utils import timezone


class PlantType(models.TextChoices):
    TREE = 'tree', 'Tree'
    PLANT = 'plant', 'Plant'
    CREEPER = 'creeper', 'Creeper / Climber'


class CampusArea(models.TextChoices):
    HOUSING_ZONE      = 'housing_zone',      'Housing Zone'
    HOSTELS           = 'hostels',           'Hostels'
    ACADEMIC_BLOCK    = 'academic_block',    'Academic Block'
    GROUND_SPORTS     = 'ground_sports',     'Ground Area / Sports Complex'
    RESEARCH_PARK     = 'research_park',     'Research Park'
    RANG_MANCH        = 'rang_manch',        'Rang Manch'
    CENTRAL_ARCADE    = 'central_arcade',    'Central Arcade'
    ROAD_AREA         = 'road_area',         'Road Area'
    GATE_1            = 'gate_1',            'Gate 1'
    WATER_TREATMENT   = 'water_treatment',   'Water Treatment Plant'


PLANT_TYPE_PREFIXES = {
    PlantType.TREE: 'T',
    PlantType.PLANT: 'P',
    PlantType.CREEPER: 'C',
}


ZONE_OFFSETS = {
    CampusArea.HOSTELS: 0,
    CampusArea.HOUSING_ZONE: 5000,
    CampusArea.ACADEMIC_BLOCK: 10000,
    CampusArea.GROUND_SPORTS: 15000,
    CampusArea.RESEARCH_PARK: 20000,
    CampusArea.RANG_MANCH: 25000,
    CampusArea.CENTRAL_ARCADE: 30000,
    CampusArea.ROAD_AREA: 35000,
    CampusArea.GATE_1: 40000,
    CampusArea.WATER_TREATMENT: 45000,
}


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
    tracking_id = models.CharField(max_length=7, unique=True, editable=False)
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

    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)

    zone = models.CharField(
        max_length=50,
        choices=CampusArea.choices,
        blank=True,
        help_text='Campus area / zone',
    )

    height_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Height in metres'
    )

    girth_cm = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Girth/circumference at breast height in centimetres'
    )

    canopy_area_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Canopy span in metres'
    )

    CONDITION_CHOICES = [
        ('excellent', 'Excellent'),
        ('good', 'Good'),
        ('fair', 'Fair'),
        ('poor', 'Poor'),
        ('dead', 'Dead'),
    ]

    condition = models.CharField(
        max_length=20,
        choices=CONDITION_CHOICES,
        default='good'
    )

    photo = models.ImageField(
        upload_to='geo_tracker/photos/',
        null=True,
        blank=True
    )

    gps_accuracy_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='GPS accuracy radius in metres at time of capture (lower = better)',
    )

    notes = models.TextField(blank=True)

    submitted_by = models.CharField(
        max_length=200,
        blank=True,
        default='Geo tracker form',
        help_text='Submission source or staff name',
    )

    submitted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f"{self.tracking_id} - {self.local_name} ({self.get_plant_type_display()})"

    def save(self, *args, **kwargs):
        if self.tracking_id:
            return super().save(*args, **kwargs)

        prefix = PLANT_TYPE_PREFIXES.get(self.plant_type)

        if not prefix:
            return super().save(*args, **kwargs)

        for _ in range(3):
            self.tracking_id = self._next_tracking_id(
                prefix=prefix,
                zone=self.zone,
            )

            try:
                return super().save(*args, **kwargs)
            except IntegrityError:
                self.tracking_id = ''

        return super().save(*args, **kwargs)

    @classmethod
    def _next_tracking_id(cls, prefix, zone):
        offset = ZONE_OFFSETS.get(zone, 0)

        plant_type = {
            'T': PlantType.TREE,
            'P': PlantType.PLANT,
            'C': PlantType.CREEPER,
        }[prefix]

        count = cls.objects.filter(
            plant_type=plant_type,
            zone=zone,
        ).count()

        next_number = offset + count + 1

        return f'{prefix}-{next_number:05d}'

    @property
    def lat(self):
        return float(self.latitude)

    @property
    def lng(self):
        return float(self.longitude)