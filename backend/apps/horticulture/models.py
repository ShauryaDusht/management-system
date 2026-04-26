from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class HorticultureZone(models.Model):
    name = models.CharField(max_length=100)
    color_code = models.CharField(max_length=20)
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='horticulture_supervised_zones',
        limit_choices_to={'role': 'supervisor'},
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class HorticultureArea(models.Model):
    area_number = models.PositiveSmallIntegerField(
        unique=True,
        validators=[MinValueValidator(1), MaxValueValidator(36)],
    )
    name = models.CharField(max_length=200)
    area_sqm = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    zone = models.ForeignKey(
        HorticultureZone,
        on_delete=models.CASCADE,
        related_name='areas',
    )

    class Meta:
        ordering = ['area_number']

    def __str__(self):
        return f"Area {self.area_number} - {self.name}"


class HorticultureRoad(models.Model):
    road_code = models.CharField(max_length=20)
    name = models.CharField(max_length=200)
    zone = models.ForeignKey(
        HorticultureZone,
        on_delete=models.CASCADE,
        related_name='roads',
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['road_code', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['zone', 'road_code'],
                name='horticulture_road_unique_code_per_zone',
            ),
        ]

    def __str__(self):
        return f"{self.road_code} - {self.name}"


class SeasonSetting(models.Model):
    class Season(models.TextChoices):
        SUMMER = 'summer', 'Summer'
        WINTER = 'winter', 'Winter'
        RAINY = 'rainy', 'Rainy'

    season = models.CharField(max_length=10, choices=Season.choices)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='horticulture_season_updates',
        limit_choices_to={'role__in': ['admin', 'horticulture_manager']},
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Season setting'
        verbose_name_plural = 'Season setting'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Current season: {self.get_season_display()}"


class TaskType(models.Model):
    name = models.CharField(max_length=100, unique=True)
    threshold_days_default = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    threshold_days_summer = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
    )
    threshold_days_winter = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
    )
    threshold_days_rainy = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class HorticultureWorker(models.Model):
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, blank=True)
    pay_code = models.CharField(max_length=20, blank=True)
    photo = models.ImageField(upload_to='horticulture/workers/photos/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class HorticultureWorkerArea(models.Model):
    worker = models.ForeignKey(
        HorticultureWorker,
        on_delete=models.CASCADE,
        related_name='area_assignments',
    )
    area = models.ForeignKey(
        HorticultureArea,
        on_delete=models.CASCADE,
        related_name='worker_assignments',
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='horticulture_worker_area_assignments',
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['area__area_number', 'worker__name']
        constraints = [
            models.UniqueConstraint(
                fields=['worker', 'area'],
                name='horticulture_worker_area_unique_assignment',
            ),
        ]

    def __str__(self):
        return f'{self.worker} -> {self.area}'


class HorticultureAttendanceRecord(models.Model):
    class Half(models.TextChoices):
        FIRST = 'first', 'First Half (8AM-1PM)'
        SECOND = 'second', 'Second Half (1PM-5PM)'

    class Status(models.TextChoices):
        PRESENT = 'present', 'Present'
        ABSENT = 'absent', 'Absent'
        LATE = 'late', 'Late'
        LEAVE = 'leave', 'On Leave'

    worker = models.ForeignKey(
        HorticultureWorker,
        on_delete=models.CASCADE,
        related_name='attendance_records',
    )
    date = models.DateField()
    half = models.CharField(max_length=10, choices=Half.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PRESENT)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='horticulture_attendance_marked',
    )
    submitted_at = models.DateTimeField(default=timezone.now)
    is_submitted = models.BooleanField(default=False)

    class Meta:
        ordering = ['-date', 'half', 'worker__name']
        constraints = [
            models.UniqueConstraint(
                fields=['worker', 'date', 'half'],
                name='horticulture_attendance_record_unique_half',
            ),
        ]

    def __str__(self):
        return f'{self.worker} | {self.date} | {self.half} | {self.status}'


class HorticultureDailyAssignment(models.Model):
    class Session(models.TextChoices):
        MORNING = 'morning', 'Morning'
        AFTERNOON = 'afternoon', 'Afternoon'

    worker = models.ForeignKey(
        HorticultureWorker,
        on_delete=models.CASCADE,
        related_name='daily_assignments',
    )
    area = models.ForeignKey(
        HorticultureArea,
        on_delete=models.PROTECT,
        related_name='daily_assignments',
    )
    date = models.DateField()
    session = models.CharField(max_length=12, choices=Session.choices)
    task_type = models.ForeignKey(
        TaskType,
        on_delete=models.PROTECT,
        related_name='daily_assignments',
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='horticulture_daily_assignments',
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    photo = models.ImageField(upload_to='horticulture/tasks/%Y/%m/%d/', null=True, blank=True)
    photo_uploaded_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ['-date', 'session', 'area__area_number', 'worker__name']
        constraints = [
            models.UniqueConstraint(
                fields=['worker', 'date', 'session'],
                name='horticulture_daily_assignment_unique_worker_session',
            ),
        ]

    def __str__(self):
        return f'{self.date} | {self.session} | {self.worker} | {self.task_type}'


class HorticultureAreaTaskAssignment(models.Model):
    class Session(models.TextChoices):
        ANY = 'any', 'Any Time'
        MORNING = 'morning', 'Morning'
        AFTERNOON = 'afternoon', 'Afternoon'

    area = models.ForeignKey(
        HorticultureArea,
        on_delete=models.CASCADE,
        related_name='admin_task_assignments',
    )
    task_type = models.ForeignKey(
        TaskType,
        on_delete=models.PROTECT,
        related_name='area_task_assignments',
    )
    date = models.DateField()
    session = models.CharField(max_length=12, choices=Session.choices, default=Session.ANY)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='horticulture_area_task_assignments',
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-date', 'area__area_number', 'task_type__name']
        constraints = [
            models.UniqueConstraint(
                fields=['area', 'task_type', 'date', 'session'],
                name='horticulture_area_task_unique_session',
            ),
        ]

    def __str__(self):
        return f'{self.date} | {self.area} | {self.task_type}'


class HorticultureAreaStock(models.Model):
    area = models.ForeignKey(HorticultureArea, on_delete=models.CASCADE, related_name='area_stocks')
    item_name = models.CharField(max_length=200)
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit = models.CharField(max_length=50, blank=True)
    low_stock_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=5)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['item_name']
        constraints = [
            models.UniqueConstraint(
                fields=['area', 'item_name'],
                name='horticulture_area_stock_unique_item',
            ),
        ]

    @property
    def is_low(self):
        return self.quantity <= self.low_stock_threshold

    def __str__(self):
        return f'{self.area} | {self.item_name} | {self.quantity} {self.unit}'


class HorticultureStockRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        ISSUED = 'issued', 'Issued'

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='horticulture_stock_requests',
    )
    area = models.ForeignKey(
        HorticultureArea,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_requests',
    )
    item_name = models.CharField(max_length=200)
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit = models.CharField(max_length=50, blank=True)
    reason = models.TextField()
    is_urgent = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    inventory_request = models.OneToOneField(
        'inventory.ItemRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='horticulture_stock_request',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.requested_by} -> {self.item_name} [{self.status}]'


class TaskLog(models.Model):
    zone = models.ForeignKey(
        HorticultureZone,
        on_delete=models.PROTECT,
        related_name='task_logs',
    )
    area = models.ForeignKey(
        HorticultureArea,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='task_logs',
    )
    road = models.ForeignKey(
        HorticultureRoad,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='task_logs',
    )
    task_type = models.ForeignKey(
        TaskType,
        on_delete=models.PROTECT,
        related_name='task_logs',
    )
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='horticulture_tasks_completed',
        limit_choices_to={'role': 'supervisor'},
    )
    done_date = models.DateField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-done_date', '-created_at']
        constraints = [
            models.CheckConstraint(
                check=~(models.Q(area__isnull=False) & models.Q(road__isnull=False)),
                name='horticulture_tasklog_area_and_road_not_both_set',
            ),
        ]

    def __str__(self):
        target = self.area or self.road or self.zone
        return f"{self.task_type} on {target} ({self.done_date})"

    def clean(self):
        errors = {}

        if self.area_id and self.road_id:
            errors['road'] = 'Select either an area or a road, not both.'

        if self.zone_id and self.area_id and self.area.zone_id != self.zone_id:
            errors['area'] = 'Selected area must belong to the selected zone.'

        if self.zone_id and self.road_id and self.road.zone_id != self.zone_id:
            errors['road'] = 'Selected road must belong to the selected zone.'

        if errors:
            raise ValidationError(errors)

    @property
    def days_since_done(self):
        return (timezone.localdate() - self.done_date).days


class HorticultureAttendance(models.Model):
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='horticulture_attendance_submissions',
        limit_choices_to={'role': 'supervisor'},
    )
    date = models.DateField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', 'supervisor__username']
        constraints = [
            models.UniqueConstraint(
                fields=['supervisor', 'date'],
                name='horticulture_attendance_unique_supervisor_date',
            ),
        ]

    def __str__(self):
        return f"{self.supervisor} - {self.date}"


class WorkerAttendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = 'present', 'Present'
        ABSENT = 'absent', 'Absent'
        HALF_DAY = 'half_day', 'Half Day'

    attendance = models.ForeignKey(
        HorticultureAttendance,
        on_delete=models.CASCADE,
        related_name='worker_attendances',
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='horticulture_worker_attendances',
    )
    status = models.CharField(max_length=10, choices=Status.choices)

    class Meta:
        ordering = ['attendance__date', 'worker__username']
        constraints = [
            models.UniqueConstraint(
                fields=['attendance', 'worker'],
                name='horticulture_worker_attendance_unique_entry',
            ),
        ]

    def __str__(self):
        return f"{self.worker} - {self.attendance.date} - {self.get_status_display()}"
