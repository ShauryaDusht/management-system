from django.db import models
from django.conf import settings
from django.utils import timezone

from apps.housekeeping.models import HKWorker


class MonthlyReport(models.Model):
    """
    Stores a generated monthly procurement snapshot.
    - month / year identify the reporting period.
    - snapshot holds the full computed JSON so re-downloading never needs re-computation.
    - csv_file / pdf_file are populated when files are generated.
    """
    month = models.PositiveSmallIntegerField()   # 1–12
    year = models.PositiveSmallIntegerField()     # e.g. 2025

    # use default=timezone.now instead of auto_now_add=True so this
    generated_at = models.DateTimeField(default=timezone.now)

    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='monthly_reports_generated',
    )
    snapshot = models.JSONField(default=dict)     # full report data
    csv_file = models.FileField(upload_to='reports/csv/', blank=True, null=True)
    pdf_file = models.FileField(upload_to='reports/pdf/', blank=True, null=True)

    class Meta:
        ordering = ['-year', '-month']
        unique_together = [('month', 'year')]

    def __str__(self):
        return f"Monthly Report {self.month:02d}/{self.year}"

    @property
    def period_label(self):
        import calendar
        return f"{calendar.month_name[self.month]} {self.year}"


class WorkerMonthlyReport(models.Model):
    worker = models.ForeignKey(
        HKWorker,
        on_delete=models.CASCADE,
        related_name='monthly_reports',
    )
    month = models.PositiveSmallIntegerField()
    year = models.PositiveSmallIntegerField()
    generated_at = models.DateTimeField(default=timezone.now)
    snapshot = models.JSONField(default=dict)
    csv_file = models.FileField(upload_to='reports/workers/csv/', blank=True, null=True)

    class Meta:
        ordering = ['-year', '-month', 'worker__name']
        unique_together = [('worker', 'month', 'year')]

    def __str__(self):
        return f"Worker Report {self.worker.name} {self.month:02d}/{self.year}"
