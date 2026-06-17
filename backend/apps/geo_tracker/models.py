from django.db import models
from django.utils import timezone


# ===========================================================================
# Centralized Area Configuration
# ===========================================================================
# To add a new area, edit ONLY this section:
#   1. Add a (db_value, label) tuple to CAMPUS_AREA_CHOICES
#   2. Add db_value -> 'XXX' (3 chars) entry to AREA_CODES
#   3. Add the TextChoices member to CampusArea
# Then run: python manage.py makemigrations && python manage.py migrate
#
# Tracking-ID format:  [TYPE][AREA_CODE][00000]
#   TYPE      : T = Tree | P = Plant | C = Creeper
#   AREA_CODE : exactly 3 characters
#   Number    : 5-digit zero-padded, separate counter per type+area
#
# Examples: TABN00001  PMBG00001  CSCP00001
# ===========================================================================

CAMPUS_AREA_CHOICES = [
    # original areas
    ('housing_zone',      'Housing Zone'),
    ('hostels',           'Hostels'),
    ('academic_block',    'Academic Block'),
    ('ground_sports',     'Ground Area / Sports Complex'),
    ('research_park',     'Research Park'),
    ('rang_manch',        'Rang Manch'),
    ('central_arcade',    'Central Arcade'),
    ('road_area',         'Road Area'),
    ('gate_1',            'Gate 1'),
    ('water_treatment',   'Water Treatment Plant'),
    # new areas
    ('c2_road',           'C2 Road'),
    ('f1_road',           'F1 Road'),
    ('cycle_track_gate5', 'Cycle Track to Gate-5'),
    ('gate2_a1_road',     'Gate-2 to A1 Road'),
    ('c1_road',           'C1 Road'),
    ('k_road',            'K Road'),
    ('miya_baug',         'Miya Baug'),
    ('ab_block_old',      'AB Block - Old'),
    ('ab_block_new',      'AB Block - New'),
    ('solar_car_parking', 'Solar Car Parking'),
    ('g1_road_scenic',    'G1 Road - Scenic Drive'),
    ('director_residence',"Director's Residence & Guest House"),
    ('j2_road',           'J2 Road'),
    ('central_vista',     'Central Vista'),
    ('b1_road',           'B1 Road'),
    ('d1_road',           'D1 Road'),
    ('h1_road',           'H1 Road'),
    ('h2_road',           'H2 Road'),
    ('u_shape',           'U Shape'),
    ('bio_gas',           'Bio Gas'),
    ('a2_road',           'A2 Road'),
]

AREA_CODES = {
    # original areas
    'housing_zone':       'HZN',
    'hostels':            'HST',
    'academic_block':     'ACB',
    'ground_sports':      'GRS',
    'research_park':      'RSP',
    'rang_manch':         'RMN',
    'central_arcade':     'CAR',
    'road_area':          'ROD',
    'gate_1':             'GT1',
    'water_treatment':    'WTP',
    # new areas
    'c2_road':            'C2R',
    'f1_road':            'F1R',
    'cycle_track_gate5':  'CT5',
    'gate2_a1_road':      'G2A',
    'c1_road':            'C1R',
    'k_road':             'KRD',
    'miya_baug':          'MBG',
    'ab_block_old':       'ABO',
    'ab_block_new':       'ABN',
    'solar_car_parking':  'SCP',
    'g1_road_scenic':     'G1S',
    'director_residence': 'DRG',
    'j2_road':            'J2R',
    'central_vista':      'CVS',
    'b1_road':            'B1R',
    'd1_road':            'D1R',
    'h1_road':            'H1R',
    'h2_road':            'H2R',
    'u_shape':            'USP',
    'bio_gas':            'BGS',
    'a2_road':            'A2R',
}

PLANT_TYPE_PREFIXES = {
    'tree':    'T',
    'plant':   'P',
    'creeper': 'C',
}


class PlantType(models.TextChoices):
    TREE    = 'tree',    'Tree'
    PLANT   = 'plant',   'Plant'
    CREEPER = 'creeper', 'Creeper / Climber'


class CampusArea(models.TextChoices):
    # original
    HOUSING_ZONE       = 'housing_zone',      'Housing Zone'
    HOSTELS            = 'hostels',           'Hostels'
    ACADEMIC_BLOCK     = 'academic_block',    'Academic Block'
    GROUND_SPORTS      = 'ground_sports',     'Ground Area / Sports Complex'
    RESEARCH_PARK      = 'research_park',     'Research Park'
    RANG_MANCH         = 'rang_manch',        'Rang Manch'
    CENTRAL_ARCADE     = 'central_arcade',    'Central Arcade'
    ROAD_AREA          = 'road_area',         'Road Area'
    GATE_1             = 'gate_1',            'Gate 1'
    WATER_TREATMENT    = 'water_treatment',   'Water Treatment Plant'
    # new
    C2_ROAD            = 'c2_road',           'C2 Road'
    F1_ROAD            = 'f1_road',           'F1 Road'
    CYCLE_TRACK_GATE5  = 'cycle_track_gate5', 'Cycle Track to Gate-5'
    GATE2_A1_ROAD      = 'gate2_a1_road',     'Gate-2 to A1 Road'
    C1_ROAD            = 'c1_road',           'C1 Road'
    K_ROAD             = 'k_road',            'K Road'
    MIYA_BAUG          = 'miya_baug',         'Miya Baug'
    AB_BLOCK_OLD       = 'ab_block_old',      'AB Block - Old'
    AB_BLOCK_NEW       = 'ab_block_new',      'AB Block - New'
    SOLAR_CAR_PARKING  = 'solar_car_parking', 'Solar Car Parking'
    G1_ROAD_SCENIC     = 'g1_road_scenic',    'G1 Road - Scenic Drive'
    DIRECTOR_RESIDENCE = 'director_residence',"Director's Residence & Guest House"
    J2_ROAD            = 'j2_road',           'J2 Road'
    CENTRAL_VISTA      = 'central_vista',     'Central Vista'
    B1_ROAD            = 'b1_road',           'B1 Road'
    D1_ROAD            = 'd1_road',           'D1 Road'
    H1_ROAD            = 'h1_road',           'H1 Road'
    H2_ROAD            = 'h2_road',           'H2 Road'
    U_SHAPE            = 'u_shape',           'U Shape'
    BIO_GAS            = 'bio_gas',           'Bio Gas'
    A2_ROAD            = 'a2_road',           'A2 Road'


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
    # max_length=9 → 1 (type) + 3 (area code) + 5 (number) = 9
    tracking_id = models.CharField(max_length=9, unique=True, editable=False)
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
        max_digits=6, decimal_places=2, null=True, blank=True,
        help_text='Height in metres',
    )
    girth_cm = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text='Girth/circumference at breast height in centimetres',
    )
    canopy_area_m = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        help_text='Canopy span in metres',
    )

    CONDITION_CHOICES = [
        ('excellent', 'Excellent'),
        ('good',      'Good'),
        ('fair',      'Fair'),
        ('poor',      'Poor'),
        ('dead',      'Dead'),
    ]
    condition = models.CharField(
        max_length=20, choices=CONDITION_CHOICES, default='good',
    )

    photo = models.ImageField(
        upload_to='geo_tracker/photos/', null=True, blank=True,
    )

    gps_accuracy_m = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True,
        help_text='GPS accuracy radius in metres at time of capture (lower = better)',
    )

    notes = models.TextField(blank=True)

    submitted_by = models.CharField(
        max_length=200, blank=True, default='Geo tracker form',
        help_text='Submission source or staff name',
    )

    submitted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f"{self.tracking_id} - {self.local_name} ({self.get_plant_type_display()})"

    # -----------------------------------------------------------------------
    # Tracking-ID generation
    # -----------------------------------------------------------------------

    def save(self, *args, **kwargs):
        if not self.tracking_id:
            self.tracking_id = self._generate_tracking_id()
        return super().save(*args, **kwargs)

    def _generate_tracking_id(self):
        """Generate [TYPE][AREA_CODE][00000] e.g. TABN00001.

        Keeps a separate counter per (plant_type, zone) combination.
        Existing records are never renumbered.
        """
        type_prefix = PLANT_TYPE_PREFIXES.get(self.plant_type, 'X')
        area_code   = AREA_CODES.get(self.zone, 'UNK')
        prefix      = f'{type_prefix}{area_code}'

        existing = list(
            PlantRecord.objects.filter(
                tracking_id__startswith=prefix,
                tracking_id__regex=r'^\w{4}\d{5}$',
            ).values_list('tracking_id', flat=True)
        )

        max_num = max((int(tid[4:]) for tid in existing), default=0)
        return f'{prefix}{max_num + 1:05d}'

    @property
    def lat(self):
        return float(self.latitude)

    @property
    def lng(self):
        return float(self.longitude)
