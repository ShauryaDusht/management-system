from django.db import models
from django.conf import settings
from django.utils import timezone


class HKArea(models.Model):
    AREA_TYPE_CHOICES = [
        ('hostel', 'Hostel'), ('research_park', 'Research Park'),
        ('central_arcade', 'Central Arcade'), ('sports', 'Sports Complex'),
        ('academic', 'Academic Block'), ('roads', 'Roads & Outdoor'),
        ('swm', 'Solid Waste Management'), ('guesthouse', 'Guest House'),
        ('director', 'Director Bungalow'), ('jrha', 'JRHA'), ('other', 'Other'),
    ]
    name = models.CharField(max_length=100)
    area_type = models.CharField(max_length=30, choices=AREA_TYPE_CHOICES)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class HKUserArea(models.Model):
    """Links a caretaker/supervisor user to one or more areas."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hk_areas')
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='assigned_users')

    class Meta:
        unique_together = ['user', 'area']

    def __str__(self):
        return f"{self.user.get_full_name()} → {self.area.name}"


class HKWorker(models.Model):
    """Ground-level cleaning staff under a caretaker."""
    WORKER_TYPE_CHOICES = [
        ('room', 'Room Staff'),
        ('floor', 'Floor Staff'),
        ('washroom', 'Washroom Staff'),
        ('road', 'Road Cleaning'),
        ('swm', 'Waste Management'),
        ('horticulture', 'Horticulture'),
        ('reliever', 'Reliever'),
        ('general', 'General'),
    ]
    SHIFT_CHOICES = [
        ('day', 'Day (8AM–5PM)'),
        ('evening', 'Evening (2PM–11PM)'),
        ('night', 'Night (10PM–7AM)'),
    ]
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True)
    punching_no = models.CharField(max_length=20, blank=True)
    worker_type = models.CharField(max_length=20, choices=WORKER_TYPE_CHOICES, default='general')
    shift = models.CharField(max_length=10, choices=SHIFT_CHOICES, default='day')
    area = models.ForeignKey(HKArea, on_delete=models.SET_NULL, null=True, blank=True, related_name='workers')
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='supervised_workers',
    )
    photo = models.ImageField(upload_to='workers/photos/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_reliever = models.BooleanField(default=False)

    class Meta:
        ordering = ['area__name', 'worker_type', 'name']

    def __str__(self):
        return f"{self.name} — {self.area}"


class HKScheduleTemplate(models.Model):
    """
    One record per task. Admin can toggle requires_photo.
    frequency='daily' → shown Mon–Sun every day (caretaker hostels have no Sunday change).
    frequency='sunday_extra' → Sunday-only extras (dustbin, terrace, fridge).
    worker_tag: 'room' | 'floor' | 'washroom' | 'all' | 'general'
    """
    FREQUENCY_CHOICES = [
        ('daily', 'Daily (Every Day)'),
        ('sunday_extra', 'Sunday Extra Only'),
    ]
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='schedule_templates')
    order = models.IntegerField(default=0)
    start_time = models.TimeField()
    end_time = models.TimeField()
    task_name = models.CharField(max_length=200)
    task_description = models.TextField(blank=True)
    worker_tag = models.CharField(
        max_length=30, blank=True,
        help_text='room | floor | washroom | all | general'
    )
    requires_photo = models.BooleanField(
        default=False,
        help_text='Admin toggle: worker must upload after-photo to mark done'
    )
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='daily')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['area', 'worker_tag', 'order', 'start_time']

    def __str__(self):
        return f"{self.area} | [{self.worker_tag}] {self.task_name}"


class HKDailyRecord(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'), ('done', 'Done'), ('skipped', 'Skipped'),
    ]
    schedule = models.ForeignKey(
        HKScheduleTemplate, on_delete=models.CASCADE, related_name='daily_records'
    )
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='daily_records')
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='hk_tasks_completed',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    photo_before = models.ImageField(upload_to='housekeeping/photos/%Y/%m/%d/', null=True, blank=True)
    photo_after = models.ImageField(upload_to='housekeeping/photos/%Y/%m/%d/', null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    class Meta:
        unique_together = ['schedule', 'date']
        ordering = ['schedule__worker_tag', 'schedule__order', 'schedule__start_time']

    def __str__(self):
        return f"{self.area} | {self.date} | {self.schedule.task_name}"


class HKExtraWork(models.Model):
    """Ad-hoc extra work logged by the caretaker beyond fixed schedule."""
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='extra_works')
    date = models.DateField()
    task_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    worker_name = models.CharField(max_length=100, blank=True)
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='hk_extra_works_logged',
    )
    logged_at = models.DateTimeField(auto_now_add=True)
    photo = models.ImageField(upload_to='housekeeping/extra/%Y/%m/%d/', null=True, blank=True)
    is_verified = models.BooleanField(default=False)

    class Meta:
        ordering = ['-date', '-logged_at']

    def __str__(self):
        return f"{self.area} | {self.date} | {self.task_name}"


class HKAttendanceRecord(models.Model):
    """Two records per worker per day: first half and second half."""
    HALF_CHOICES = [
        ('first', 'First Half (8AM–1PM)'),
        ('second', 'Second Half (1PM–5PM)'),
    ]
    STATUS_CHOICES = [
        ('present', 'Present'), ('absent', 'Absent'),
        ('late', 'Late'), ('leave', 'On Leave'),
    ]
    worker = models.ForeignKey(HKWorker, on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField()
    half = models.CharField(max_length=10, choices=HALF_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='hk_attendance_marked',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_submitted = models.BooleanField(default=False)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ['worker', 'date', 'half']
        ordering = ['-date', 'half', 'worker__name']

    def __str__(self):
        return f"{self.worker.name} | {self.date} | {self.half} | {self.status}"


class HKSundayIncharge(models.Model):
    """
    Set on Saturday: which worker covers Sunday for this area.
    Visible only on Saturday in the app.
    """
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='sunday_incharges')
    worker = models.ForeignKey(HKWorker, on_delete=models.CASCADE, related_name='sunday_incharges')
    for_sunday = models.DateField()
    set_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    set_at = models.DateTimeField(auto_now_add=True)
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ['area', 'for_sunday']
        ordering = ['-for_sunday']

    def __str__(self):
        return f"{self.area} | Sunday {self.for_sunday} | {self.worker.name}"


class HKAreaStock(models.Model):
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='area_stocks')
    item_name = models.CharField(max_length=200)
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit = models.CharField(max_length=50, blank=True)
    low_stock_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=5)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['area', 'item_name']
        ordering = ['item_name']

    @property
    def is_low(self):
        return self.quantity <= self.low_stock_threshold

    def __str__(self):
        return f"{self.area} | {self.item_name} | {self.quantity} {self.unit}"


class HKStockRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'), ('approved', 'Approved'),
        ('rejected', 'Rejected'), ('issued', 'Issued'),
    ]
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hk_stock_requests'
    )
    area = models.ForeignKey(HKArea, on_delete=models.SET_NULL, null=True, related_name='stock_requests')
    item_name = models.CharField(max_length=200)
    item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit = models.CharField(max_length=50, blank=True)
    reason = models.TextField()
    is_urgent = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    inventory_request = models.OneToOneField(
        'inventory.ItemRequest', on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.requested_by} → {self.item_name} [{self.status}]"


class HKAlert(models.Model):
    PRIORITY_CHOICES = [('info', 'Info'), ('warning', 'Warning'), ('urgent', 'Urgent')]
    title = models.CharField(max_length=200)
    message = models.TextField()
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='info')
    target_areas = models.ManyToManyField(HKArea, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.priority.upper()}] {self.title}"


class HKRelieverSubstitution(models.Model):
    """
    When a permanent worker is absent, a reliever covers their slot for the day.
    Logged by caretaker/supervisor. Auto-marks original worker as leave.
    """
    original_worker = models.ForeignKey(
        HKWorker, on_delete=models.CASCADE,
        related_name='substituted_by',
    )
    reliever = models.ForeignKey(
        HKWorker, on_delete=models.CASCADE,
        related_name='substitution_slots',
    )
    date = models.DateField()
    area = models.ForeignKey(
        HKArea, on_delete=models.CASCADE,
        related_name='reliever_substitutions',
    )
    note = models.CharField(max_length=200, blank=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='reliever_assignments',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['original_worker', 'date']
        ordering = ['-date']

    def __str__(self):
        return f"{self.date} | {self.original_worker.name} -> {self.reliever.name}"
