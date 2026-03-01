from django.db import models
from django.conf import settings


class MonthlyReport(models.Model):
    """
    Stores a generated monthly procurement snapshot.
    - month / year identify the reporting period.
    - snapshot holds the full computed JSON so re-downloading never needs
      re-computation.
    - csv_file / pdf_file are populated in Phase 3B when files are generated.
    """
    month = models.PositiveSmallIntegerField()   # 1–12
    year = models.PositiveSmallIntegerField()     # e.g. 2025
    generated_at = models.DateTimeField(auto_now_add=True)
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
