import datetime
import uuid

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


class HKTemporaryStaffAreaAssignment(models.Model):
    """Temporary staff-area access without changing permanent HKUserArea mappings."""
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hk_temporary_area_assignments',
    )
    area = models.ForeignKey(
        HKArea,
        on_delete=models.CASCADE,
        related_name='temporary_staff_assignments',
    )
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField()
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hk_temporary_area_assignments_created',
    )
    note = models.CharField(max_length=300, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hk_temporary_area_assignments_revoked',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date', 'staff__first_name', 'area__name']

    @property
    def is_active_now(self):
        today = timezone.localdate()
        return self.revoked_at is None and self.start_date <= today <= self.end_date

    def __str__(self):
        return f"{self.staff} -> {self.area} ({self.start_date} to {self.end_date})"


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
    pay_code = models.CharField(max_length=20, blank=True)
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
        ('saturday_special', 'Saturday Special Only'),
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
    is_optional_weekend_task = models.BooleanField(
        default=False,
        help_text='Optional weekend task visible to staff but excluded from progress until selected.',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['area', 'worker_tag', 'order', 'start_time']

    @property
    def duration_minutes(self):
        """Task duration in minutes, supports overnight end-times."""
        start_dt = datetime.datetime.combine(datetime.date.today(), self.start_time)
        end_dt = datetime.datetime.combine(datetime.date.today(), self.end_time)
        if end_dt <= start_dt:
            end_dt += datetime.timedelta(days=1)
        return int((end_dt - start_dt).total_seconds() // 60)

    @property
    def period_label(self):
        """
        Period bucket label for mobile UI.
        Requested by users to view task periods (30m/1h/2h+) over exact clock slots.
        """
        if 'tea break' in (self.task_name or '').lower():
            return '15 min'
        mins = self.duration_minutes
        if mins <= 15:
            return '15 min'
        if mins <= 30:
            return '30 min'
        if mins <= 60:
            return '1 hour'
        if mins <= 120:
            return '2 hours'
        hours = max(1, round(mins / 60))
        return f'{hours} hours'

    def __str__(self):
        return f"{self.area} | [{self.worker_tag}] {self.task_name}"


class HKDailyRecord(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('done', 'Done'),
        ('skipped', 'Skipped'),
    ]
    schedule = models.ForeignKey(
        HKScheduleTemplate, on_delete=models.CASCADE, related_name='daily_records'
    )
    originating_template = models.ForeignKey(
        HKScheduleTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='originated_daily_records',
        help_text='Original template used to create this daily record (for temporary-task cleanup).',
    )
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='daily_records')
    date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    assigned_worker = models.ForeignKey(
        HKWorker, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='assigned_daily_records',
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='hk_tasks_assigned',
    )
    assigned_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='hk_tasks_completed',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    photo_before = models.ImageField(upload_to='housekeeping/photos/%Y/%m/%d/', null=True, blank=True)
    photo_after = models.ImageField(upload_to='housekeeping/photos/%Y/%m/%d/', null=True, blank=True)
    photo_after_thumbnail = models.ImageField(upload_to='housekeeping/photos/%Y/%m/%d/thumbs/', null=True, blank=True)
    photo_after_captured_at = models.DateTimeField(null=True, blank=True)
    photo_after_capture_method = models.CharField(max_length=20, blank=True)
    photo_after_original_size = models.PositiveIntegerField(default=0)
    photo_after_saved_size = models.PositiveIntegerField(default=0)
    photo_after_thumb_size = models.PositiveIntegerField(default=0)
    photo_after_compression_ratio = models.PositiveSmallIntegerField(default=0)
    photo_after_format = models.CharField(max_length=20, blank=True)
    photo_after_flagged = models.BooleanField(default=False)
    photo_after_flag_note = models.CharField(max_length=300, blank=True)
    photo_after_flagged_at = models.DateTimeField(null=True, blank=True)
    photo_after_flagged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hk_flagged_task_photos',
    )
    note = models.CharField(max_length=300, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    class Meta:
        unique_together = ['schedule', 'date']
        ordering = ['schedule__worker_tag', 'schedule__order', 'schedule__start_time']

    def __str__(self):
        return f"{self.area} | {self.date} | {self.schedule.task_name}"


class HKTaskWorkerAssignment(models.Model):
    """
    Multi-worker task assignment support.
    Used primarily for SWM where one task may have 2-4 workers.
    """
    daily_record = models.ForeignKey(
        HKDailyRecord,
        on_delete=models.CASCADE,
        related_name='worker_assignments',
    )
    worker = models.ForeignKey(
        HKWorker,
        on_delete=models.CASCADE,
        related_name='task_assignments',
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hk_multi_worker_assignments',
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['daily_record', 'worker']
        ordering = ['assigned_at', 'worker__name']

    def __str__(self):
        return f"{self.daily_record_id} | {self.worker.name}"


class HKExtraWork(models.Model):
    """Ad-hoc extra work logged by the caretaker beyond fixed schedule."""
    area = models.ForeignKey(HKArea, on_delete=models.CASCADE, related_name='extra_works')
    date = models.DateField()
    task_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    worker_name = models.CharField(max_length=255, blank=True)
    assigned_workers = models.ManyToManyField(
        HKWorker,
        blank=True,
        related_name='extra_work_logs',
    )
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


class HKStaffAttendanceRecord(models.Model):
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('leave', 'On Leave'),
    ]
    SOURCE_CHOICES = [
        ('auto_attendance', 'Auto Attendance'),
        ('auto_leave', 'Auto Leave'),
        ('manual', 'Manual'),
    ]
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hk_staff_attendance_records',
    )
    date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    marked_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default='manual')
    note = models.CharField(max_length=200, blank=True)
    leave_request = models.ForeignKey(
        'HKLeaveRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff_attendance_records',
    )

    class Meta:
        unique_together = ['staff', 'date']

    def __str__(self):
        return f"{self.staff} | {self.date} | {self.status}"


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


class HKWorkerSelectionRequest(models.Model):
    """
    Admin workflow for moving workers across areas with explicit approval.
    A request can include one worker or many workers.
    """
    SELECTION_TYPE_CHOICES = [
        ('all', 'All Workers'),
        ('section', 'Section Workers'),
        ('specific', 'Specific Workers'),
    ]
    SECTION_FILTER_CHOICES = [
        ('all', 'All'),
        ('hostels', 'Hostels'),
        ('academic', 'Academic Blocks'),
        ('others', 'Others'),
    ]
    TARGET_GROUP_CHOICES = [
        ('all', 'All'),
        ('hostels', 'Hostels'),
        ('academic', 'Academic Blocks'),
        ('others', 'Others'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    selection_type = models.CharField(max_length=20, choices=SELECTION_TYPE_CHOICES, default='specific')
    section_filter = models.CharField(max_length=20, choices=SECTION_FILTER_CHOICES, default='all')
    target_group = models.CharField(max_length=20, choices=TARGET_GROUP_CHOICES, default='all')
    source_area = models.ForeignKey(
        HKArea,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='worker_selection_source_requests',
    )
    target_area = models.ForeignKey(
        HKArea,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='worker_selection_target_requests',
    )
    target_supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hk_worker_selection_target_requests',
        limit_choices_to={'role__in': ['supervisor', 'caretaker']},
    )
    workers = models.ManyToManyField(HKWorker, related_name='selection_requests')
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='hk_worker_selection_requests_created',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hk_worker_selection_requests_decided',
    )
    decision_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        target = self.target_area.name if self.target_area else self.get_target_group_display()
        return f"Worker selection #{self.pk} -> {target} ({self.status})"


class HKLeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('awaiting_incharge', 'Awaiting Incharge Selection'),
        ('pending_acceptance', 'Pending Incharge Acceptance'),
        ('pending_admin_approval', 'Pending Admin Approval'),
        ('approved', 'Approved'),
        ('reassign_required', 'Reassign Required'),
        ('cancelled', 'Cancelled'),
    ]

    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hk_leave_requests',
    )
    area = models.ForeignKey(
        HKArea,
        on_delete=models.CASCADE,
        related_name='hk_leave_requests',
    )
    leave_date = models.DateField()
    reason = models.CharField(max_length=300, blank=True)
    all_areas = models.BooleanField(
        default=False,
        help_text='If true, this leave request covers all areas assigned to the leave staff.',
    )
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='awaiting_incharge')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-leave_date', '-created_at']
        unique_together = ['staff', 'leave_date']

    def __str__(self):
        return f"Leave {self.leave_date} | {self.staff} | {self.status}"


class HKInchargeAssignment(models.Model):
    STATUS_CHOICES = [
        ('pending_acceptance', 'Pending Acceptance'),
        ('declined', 'Declined'),
        ('pending_admin_approval', 'Pending Admin Approval'),
        ('admin_rejected', 'Admin Rejected'),
        ('approved', 'Approved'),
    ]
    AREA_GROUP_CHOICES = [
        ('hostels', 'Hostels'),
        ('academic', 'Academic Blocks'),
        ('others', 'Others'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    leave_request = models.OneToOneField(
        HKLeaveRequest,
        on_delete=models.CASCADE,
        related_name='incharge_assignment',
    )
    area = models.ForeignKey(
        HKArea,
        on_delete=models.CASCADE,
        related_name='incharge_assignments',
    )
    leave_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hk_incharge_leave_requests',
    )
    leave_staff_name = models.CharField(max_length=120)
    leave_staff_area = models.CharField(max_length=20, choices=AREA_GROUP_CHOICES)
    leave_date = models.DateField()
    assigned_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hk_incharge_assigned_requests',
    )
    assigned_staff_name = models.CharField(max_length=120)
    cover_all_areas = models.BooleanField(
        default=False,
        help_text='If true, approved assignment grants temporary incharge access to all leave-staff areas for that date.',
    )
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending_acceptance')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    admin_action_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hk_incharge_admin_actions',
    )
    admin_action_at = models.DateTimeField(null=True, blank=True)
    admin_action_note = models.CharField(max_length=300, blank=True)
    staff_action_at = models.DateTimeField(null=True, blank=True)
    staff_action_note = models.CharField(max_length=300, blank=True)
    arrival_notified = models.BooleanField(default=False)

    class Meta:
        ordering = ['-leave_date', '-created_at']

    def __str__(self):
        return f"Incharge {self.leave_date} | {self.leave_staff_name} -> {self.assigned_staff_name} ({self.status})"


class HKInchargeNotification(models.Model):
    LEVEL_CHOICES = [
        ('info', 'Info'),
        ('success', 'Success'),
        ('warning', 'Warning'),
        ('error', 'Error'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='hk_incharge_notifications',
    )
    assignment = models.ForeignKey(
        HKInchargeAssignment,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    message = models.CharField(max_length=300)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='info')
    is_seen = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user} | {self.level} | {self.message[:60]}"
