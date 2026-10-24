from django.db import models


class StationMeter(models.Model):
    STATION_CHOICES = [
        ('wtp', 'WTP / WSC-II'),
        ('stp', 'STP / WSC-I'),
        ('wsc3', 'WSC-III'),
        ('jm', 'Jalmandapam'),
    ]

    k = models.CharField(max_length=50, primary_key=True)
    label = models.CharField(max_length=150)
    station = models.CharField(max_length=20, choices=STATION_CHOICES, db_index=True)
    group_name = models.CharField(max_length=100, default='General')
    unit = models.CharField(max_length=20, default='CUM')
    cum = models.BooleanField(default=True)
    coef = models.FloatField(default=1.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['station', 'created_at']
        verbose_name = 'Station Meter'
        verbose_name_plural = 'Station Meters'

    def __str__(self):
        return f"{self.label} ({self.station.upper()})"

    def to_dict(self):
        return {
            '_id': str(self.k),
            'id': str(self.k),
            'k': self.k,
            'label': self.label,
            'station': self.station,
            'groupName': self.group_name,
            'unit': self.unit,
            'cum': self.cum,
            'coef': self.coef,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }


class WtpReading(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending Verification'),
        ('verified', 'Verified'),
        ('flagged', 'Flagged / Anomaly'),
    ]

    date = models.DateField(db_index=True)
    shift = models.IntegerField()
    station = models.CharField(max_length=20, db_index=True)
    values = models.JSONField(default=dict, blank=True)
    by = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    supervisor_note = models.TextField(blank=True)
    verified_by = models.CharField(max_length=100, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('date', 'shift', 'station')
        ordering = ['date', 'shift', 'station']
        indexes = [
            models.Index(fields=['date', 'shift']),
            models.Index(fields=['station', 'date']),
        ]
        verbose_name = 'WTP / STP Reading'
        verbose_name_plural = 'WTP / STP Readings'

    def __str__(self):
        return f"{self.station.upper()} - {self.date} Shift {self.shift}"

    def to_dict(self):
        return {
            '_id': str(self.id),
            'id': str(self.id),
            'date': str(self.date),
            'shift': self.shift,
            'station': self.station,
            'values': self.values or {},
            'by': self.by,
            'status': self.status,
            'supervisorNote': self.supervisor_note,
            'verifiedBy': self.verified_by,
            'verifiedAt': self.verified_at.isoformat() if self.verified_at else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }


class BlockMeter(models.Model):
    sr = models.IntegerField(primary_key=True)
    block = models.CharField(max_length=150)
    meter_no = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sr']
        verbose_name = 'Block Meter'
        verbose_name_plural = 'Block Meters'

    def __str__(self):
        return f"#{self.sr} {self.block} ({self.meter_no})"

    def to_dict(self):
        return {
            '_id': str(self.sr),
            'sr': self.sr,
            'block': self.block,
            'meterNo': self.meter_no,
        }


class BlockReading(models.Model):
    month = models.CharField(max_length=7, primary_key=True)  # YYYY-MM
    date = models.CharField(max_length=20, blank=True)
    by = models.CharField(max_length=100, blank=True)
    readings = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['month']
        verbose_name = 'Block Reading'
        verbose_name_plural = 'Block Readings'

    def __str__(self):
        return f"Block Readings {self.month}"

    def to_dict(self):
        return {
            '_id': self.month,
            'month': self.month,
            'date': self.date,
            'by': self.by,
            'readings': self.readings or {},
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }


class SupervisorLog(models.Model):
    date = models.DateField(db_index=True)
    shift = models.IntegerField()
    supervisor_name = models.CharField(max_length=100, default='Shift Engineer')
    status = models.CharField(max_length=30, default='Normal')
    notes = models.TextField(blank=True, default='')
    handover_notes = models.TextField(blank=True, default='')
    checklist = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('date', 'shift')
        ordering = ['-date', '-shift']
        verbose_name = 'Supervisor Log'
        verbose_name_plural = 'Supervisor Logs'

    def __str__(self):
        return f"Supervisor Log {self.date} Shift {self.shift}"

    def to_dict(self):
        return {
            '_id': f"{self.date}_{self.shift}",
            'date': str(self.date),
            'shift': self.shift,
            'supervisorName': self.supervisor_name,
            'status': self.status,
            'notes': self.notes,
            'handoverNotes': self.handover_notes,
            'checklist': self.checklist or {
                'wtpChecked': True,
                'stpChecked': True,
                'chlorineChecked': True,
                'jmTanksChecked': True,
            },
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }


class GwssbBill(models.Model):
    month = models.CharField(max_length=7, primary_key=True)  # YYYY-MM
    date = models.CharField(max_length=20, blank=True)
    initial_reading = models.FloatField(default=0.0)
    final_reading = models.FloatField(default=0.0)
    net_consumption = models.FloatField(default=0.0)  # (final_reading - initial_reading) * 1000
    rate_per_unit = models.FloatField(default=10.0)   # Rs 10 per unit
    bill_amount = models.FloatField(default=0.0)      # net_consumption * 10 (Calculated)
    actual_bill = models.FloatField(default=0.0, null=True, blank=True)  # Filled by Supervisor from official GWSSB invoice
    bill_no = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=30, default='Pending')  # Pending, Verified, Paid
    by = models.CharField(max_length=100, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-month']
        verbose_name = 'GWSSB Bill'
        verbose_name_plural = 'GWSSB Bills'

    def save(self, *args, **kwargs):
        # Auto-compute if not provided:
        # Net Water Consumption = (Final - Initial) * 1000
        # Bill Amount = Net Water Consumption * 10
        diff = max(0.0, float(self.final_reading or 0.0) - float(self.initial_reading or 0.0))
        self.net_consumption = round(diff * 1000.0, 2)
        rate = float(self.rate_per_unit if self.rate_per_unit is not None else 10.0)
        self.bill_amount = round(self.net_consumption * rate, 2)
        super().save(*args, **kwargs)

    @property
    def reading_diff(self):
        return round(max(0.0, float(self.final_reading or 0.0) - float(self.initial_reading or 0.0)), 3)

    @property
    def variance(self):
        if self.actual_bill is not None and self.actual_bill > 0:
            return round(float(self.actual_bill) - float(self.bill_amount), 2)
        return 0.0

    def to_dict(self):
        diff = self.reading_diff
        actual = self.actual_bill if self.actual_bill is not None else 0.0
        variance = self.variance
        return {
            '_id': self.month,
            'id': self.month,
            'month': self.month,
            'date': self.date,
            'initialReading': self.initial_reading,
            'finalReading': self.final_reading,
            'readingDiff': round(diff, 3),
            'netConsumption': self.net_consumption,
            'ratePerUnit': self.rate_per_unit,
            'billAmount': self.bill_amount,
            'actualBill': self.actual_bill,
            'variance': variance,
            'billNo': self.bill_no,
            'status': self.status,
            'by': self.by,
            'remarks': self.remarks,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }

