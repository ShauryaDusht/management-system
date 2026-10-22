from datetime import date
from django.conf import settings
from django.db import models


class LiftLicense(models.Model):
    loc = models.CharField(max_length=200, verbose_name="Location / Building")
    lift = models.CharField(max_length=200, verbose_name="Lift Identifier")
    no = models.CharField(max_length=150, unique=True, verbose_name="License Number")
    equipment_no = models.CharField(max_length=100, blank=True, default='', verbose_name="Equipment Number")
    prov = models.CharField(max_length=200, blank=True, null=True, verbose_name="Elevator Provider / OEM")
    frm = models.DateField(blank=True, null=True, verbose_name="Valid From")
    till = models.DateField(blank=True, null=True, verbose_name="Valid Till")
    eng = models.CharField(max_length=150, blank=True, null=True, default='Mr. Naveen Rai', verbose_name="Contact Engineer / In-charge")
    rem = models.CharField(max_length=300, blank=True, null=True, verbose_name="Remarks / Block")
    is_applied = models.BooleanField(default=False, verbose_name="Renewal Form Applied")
    applied_date = models.DateField(blank=True, null=True, verbose_name="Application Submission Date")
    application_no = models.CharField(max_length=150, blank=True, default='', verbose_name="Application / Challan Reference No.")
    applied_notes = models.TextField(blank=True, default='', verbose_name="Renewal Application Remarks")
    order = models.IntegerField(default=0, verbose_name="Display Order")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'Lift License'
        verbose_name_plural = 'Lift Licenses'

    def __str__(self):
        return f"{self.lift} ({self.no}) - {self.loc}"

    def days_remaining(self, as_of=None):
        if not self.till:
            return None
        reference = as_of or date.today()
        return (self.till - reference).days

    def compute_status(self, as_of=None, threshold_days=30):
        days = self.days_remaining(as_of=as_of)
        if days is None:
            return 'missing'
        if days < 0:
            return 'expired'
        if days <= threshold_days:
            return 'due'
        if days <= 90:
            return 'soon'
        return 'ok'


class LiftComplianceSetting(models.Model):
    key = models.CharField(max_length=100, unique=True, default='active_config')
    notice_window_days = models.PositiveIntegerField(default=30, verbose_name="Notice Window (Days)")
    alert_email = models.CharField(max_length=500, default='je1.electrical@iitgn.ac.in, je2.electrical@iitgn.ac.in', verbose_name="Alert Recipient Email")
    last_alert_sent_at = models.DateTimeField(null=True, blank=True)
    last_alert_date = models.DateField(null=True, blank=True)
    last_alert_window = models.PositiveIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Lift Compliance Setting'
        verbose_name_plural = 'Lift Compliance Settings'

    def __str__(self):
        return f"Config: {self.notice_window_days} Days -> {self.alert_email}"

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(
            key='active_config',
            defaults={
                'notice_window_days': 30,
                'alert_email': getattr(settings, 'LIFT_ALERT_EMAIL', 'je1.electrical@iitgn.ac.in, je2.electrical@iitgn.ac.in'),
            }
        )
        return obj


class LiftLicenseDocument(models.Model):
    lift = models.ForeignKey(LiftLicense, on_delete=models.CASCADE, related_name='documents')
    pdf_file = models.FileField(upload_to='lift_licenses/documents/%Y/%m/', verbose_name="Certificate PDF")
    title = models.CharField(max_length=200, blank=True, default='', verbose_name="Document Title / Version")
    license_no = models.CharField(max_length=150, blank=True, default='', verbose_name="License Number")
    valid_from = models.DateField(blank=True, null=True, verbose_name="Valid From")
    valid_till = models.DateField(blank=True, null=True, verbose_name="Valid Till")
    is_current = models.BooleanField(default=False, verbose_name="Is Current Active Certificate")
    uploaded_by = models.CharField(max_length=150, blank=True, default='', verbose_name="Uploaded By")
    notes = models.TextField(blank=True, default='', verbose_name="Notes / Remarks")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_current', '-valid_till', '-created_at']
        verbose_name = 'Lift License Document'
        verbose_name_plural = 'Lift License Documents'

    def __str__(self):
        status_tag = 'CURRENT' if self.is_current else 'ARCHIVED'
        return f"{self.lift.lift} - {self.title or self.license_no or 'Document'} [{status_tag}]"
