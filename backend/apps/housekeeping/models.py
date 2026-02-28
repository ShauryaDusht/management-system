from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
import datetime

User = get_user_model()

# ─── LOCATION & DEPARTMENT ───────────────────────────────────────

class HKDepartment(models.Model):
    DEPT_CHOICES = [
        ('hostel', 'Hostel'),
        ('guesthouse', 'Guest House'),
        ('sports', 'Sports Complex'),
        ('academic', 'Academic Block'),
        ('research_park', 'Research Park'),
        ('central_arcade', 'Central Arcade'),
        ('roads', 'Roads & Outdoor'),
        ('swm', 'Solid Waste Management'),
        ('horticulture', 'Horticulture'),
        ('director_bungalow', 'Director Bungalow'),
        ('jrha', 'JRHA'),
        ('other', 'Other'),
    ]
    name = models.CharField(max_length=100)
    dept_type = models.CharField(max_length=30, choices=DEPT_CHOICES)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class HKLocation(models.Model):
    department = models.ForeignKey(HKDepartment, on_delete=models.CASCADE, related_name='locations')
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)
    floor_or_area = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.department.name} - {self.name}"


# ─── STAFF ───────────────────────────────────────────────────────

class HKSupervisor(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='hk_supervisor', null=True, blank=True)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True)
    departments = models.ManyToManyField(HKDepartment, related_name='supervisors', blank=True)
    areas_managed = models.TextField(blank=True, help_text="Description of areas managed")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class HKCaretaker(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='hk_caretaker', null=True, blank=True)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True)
    locations = models.ManyToManyField(HKLocation, related_name='caretakers', blank=True)
    supervisor = models.ForeignKey(HKSupervisor, on_delete=models.SET_NULL, null=True, blank=True, related_name='caretakers')
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class HKWorker(models.Model):
    WORKER_TYPE_CHOICES = [
        ('hk_staff', 'HK Staff'),
        ('road', 'Road Cleaning'),
        ('swm', 'SWM Worker'),
        ('guesthouse', 'Guesthouse Staff'),
        ('sports', 'Sports Complex'),
        ('horticulture', 'Horticulture'),
        ('reliever', 'Reliever'),
        ('biogas', 'Biogas'),
        ('other', 'Other'),
    ]
    SHIFT_CHOICES = [
        ('day', 'Day (8AM-5PM)'),
        ('morning', 'Morning (6AM-2PM)'),
        ('evening', 'Evening (2PM-10PM)'),
        ('night', 'Night (10PM-6AM)'),
    ]
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True)
    punching_no = models.CharField(max_length=20, blank=True)
    worker_type = models.CharField(max_length=20, choices=WORKER_TYPE_CHOICES, default='hk_staff')
    shift = models.CharField(max_length=10, choices=SHIFT_CHOICES, default='day')
    department = models.ForeignKey(HKDepartment, on_delete=models.SET_NULL, null=True, blank=True, related_name='workers')
    location = models.ForeignKey(HKLocation, on_delete=models.SET_NULL, null=True, blank=True, related_name='workers')
    caretaker = models.ForeignKey(HKCaretaker, on_delete=models.SET_NULL, null=True, blank=True, related_name='workers')
    supervisor = models.ForeignKey(HKSupervisor, on_delete=models.SET_NULL, null=True, blank=True, related_name='workers')
    is_active = models.BooleanField(default=True)
    is_reliever = models.BooleanField(default=False)
    joining_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.get_worker_type_display()})"


# ─── TASK TEMPLATES (Fixed Schedule) ─────────────────────────────

class HKTaskTemplate(models.Model):
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('twice_daily', 'Twice Daily'),
        ('alternate_day', 'Alternate Day'),
        ('weekly', 'Weekly'),
        ('fortnightly', 'Fortnightly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('on_demand', 'On Demand'),
    ]
    department = models.ForeignKey(HKDepartment, on_delete=models.CASCADE, related_name='task_templates')
    location = models.ForeignKey(HKLocation, on_delete=models.SET_NULL, null=True, blank=True, related_name='task_templates')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    area = models.CharField(max_length=100, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='daily')
    worker_type = models.CharField(max_length=20, blank=True)
    shift = models.CharField(max_length=10, blank=True)
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'start_time']

    def __str__(self):
        return f"{self.department.name} - {self.name}"


# ─── ATTENDANCE ───────────────────────────────────────────────────

class HKAttendance(models.Model):
    STATUS_CHOICES = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('half_day', 'Half Day'),
        ('late', 'Late'),
        ('leave', 'On Leave'),
    ]
    worker = models.ForeignKey(HKWorker, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='present')
    marked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='hk_attendance_marked')
    marked_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ['worker', 'date']

    def __str__(self):
        return f"{self.worker.name} - {self.date} - {self.status}"


# ─── DAILY TASKS ──────────────────────────────────────────────────

class HKDailyTask(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('done', 'Done'),
        ('skipped', 'Skipped'),
        ('verified', 'Verified'),
    ]
    worker = models.ForeignKey(HKWorker, on_delete=models.CASCADE, related_name='daily_tasks')
    template = models.ForeignKey(HKTaskTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    task_name = models.CharField(max_length=200)
    area = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_note = models.CharField(max_length=300, blank=True)
    verified_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='hk_verified_tasks')
    verified_at = models.DateTimeField(null=True, blank=True)
    is_extra = models.BooleanField(default=False)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order', 'start_time']

    def __str__(self):
        return f"{self.worker.name} - {self.task_name} - {self.date}"


# ─── EXTRA WORK ───────────────────────────────────────────────────

class HKExtraWork(models.Model):
    worker = models.ForeignKey(HKWorker, on_delete=models.CASCADE, related_name='extra_works')
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='hk_extra_assigned')
    task_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    date = models.DateField(default=timezone.now)
    is_done = models.BooleanField(default=False)
    done_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.worker.name} - {self.task_name}"


# ─── COMPLAINTS / ISSUES ──────────────────────────────────────────

class HKComplaint(models.Model):
    PRIORITY_CHOICES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('urgent', 'Urgent')]
    STATUS_CHOICES = [('open', 'Open'), ('in_progress', 'In Progress'), ('resolved', 'Resolved'), ('closed', 'Closed')]

    title = models.CharField(max_length=200)
    description = models.TextField()
    location = models.ForeignKey(HKLocation, on_delete=models.SET_NULL, null=True, blank=True)
    raised_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='hk_complaints_raised')
    assigned_to = models.ForeignKey(HKWorker, on_delete=models.SET_NULL, null=True, blank=True, related_name='complaints')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='open')
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.status}"


# ─── PENALTY ──────────────────────────────────────────────────────

class HKPenalty(models.Model):
    worker = models.ForeignKey(HKWorker, on_delete=models.CASCADE, related_name='penalties', null=True, blank=True)
    location = models.ForeignKey(HKLocation, on_delete=models.SET_NULL, null=True, blank=True)
    violation_type = models.CharField(max_length=200)
    points = models.IntegerField(default=0)
    amount = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    noted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    date = models.DateField(default=timezone.now)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.violation_type} - {self.points} pts"
