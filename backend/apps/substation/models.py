from django.db import models


class SubstationSheet(models.Model):
    class Section(models.TextChoices):
        HT = 'HT', 'High Tension (HT)'
        LT = 'LT', 'Low Tension (LT)'

    id = models.CharField(max_length=50, primary_key=True)
    name = models.CharField(max_length=120)
    section = models.CharField(max_length=20, choices=Section.choices, default=Section.LT)
    full_title = models.CharField(max_length=200, blank=True)
    mode = models.CharField(max_length=30, default='snapshot')
    slots = models.JSONField(default=list, blank=True)
    tables = models.JSONField(default=list, blank=True)
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'id']
        verbose_name = 'Substation Sheet'
        verbose_name_plural = 'Substation Sheets'

    def __str__(self):
        return f"{self.name} ({self.section})"


class SubstationReading(models.Model):
    doc_id = models.CharField(max_length=100, primary_key=True)
    sheet = models.CharField(max_length=50, db_index=True)
    panel_type = models.CharField(max_length=20, default='LT', db_index=True)
    section = models.CharField(max_length=20, default='LT', db_index=True)
    substation = models.CharField(max_length=120, blank=True)
    panel_name = models.CharField(max_length=120, blank=True)
    date = models.DateField(db_index=True)
    slot = models.CharField(max_length=20, db_index=True)
    time = models.CharField(max_length=20, blank=True)
    operator = models.CharField(max_length=100, blank=True)
    rows = models.JSONField(default=dict, blank=True)
    filled = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ['-date', 'sheet', 'slot']
        indexes = [
            models.Index(fields=['sheet', 'date']),
            models.Index(fields=['panel_type', '-date']),
            models.Index(fields=['section', '-date']),
        ]
        verbose_name = 'Substation Reading'
        verbose_name_plural = 'Substation Readings'

    def __str__(self):
        return f"{self.sheet} - {self.date} [{self.slot}]"

    def to_doc(self):
        """Return dict matching the substation-log document format."""
        if self.raw_data:
            doc = dict(self.raw_data)
        else:
            doc = {}
        doc.update({
            '_id': self.doc_id,
            'sheet': self.sheet,
            'panelType': self.panel_type,
            'section': self.section,
            'substation': self.substation,
            'panelName': self.panel_name,
            'date': str(self.date),
            'slot': self.slot,
            'time': self.time,
            'operator': self.operator,
            'rows': self.rows,
            'filled': self.filled,
            'total': self.total,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        })
        return doc


class SubstationConfigDoc(models.Model):
    key = models.CharField(max_length=50, primary_key=True)
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Substation Config'
        verbose_name_plural = 'Substation Configs'

    def __str__(self):
        return f"Config [{self.key}]"


class TorrentBill(models.Model):
    month = models.CharField(max_length=7, primary_key=True)  # YYYY-MM (e.g. '2026-09')
    bill_date = models.CharField(max_length=20, blank=True, default='')  # e.g. '03/10/26'
    reading_date = models.CharField(max_length=20, blank=True, default='')  # e.g. '30/09/26'
    due_date = models.CharField(max_length=20, blank=True, default='')  # e.g. '13/10/26'
    distribution_date = models.CharField(max_length=20, blank=True, default='')
    bill_no = models.CharField(max_length=100, blank=True, default='')
    customer_id = models.CharField(max_length=50, default='100164311')
    tariff = models.CharField(max_length=50, default='HTMD1')
    pan_no = models.CharField(max_length=50, default='AAAT17352M')

    # Demand & Power Factor Parameters
    contract_demand_kw = models.FloatField(default=3200.0)  # 3200 KW
    billing_demand_kw = models.FloatField(default=0.0)      # 2832.5 KW (Recorded Demand RD)
    avg_power_factor = models.FloatField(default=100.0)     # 100% or 1.00

    # Meter Information
    meter_no = models.CharField(max_length=50, default='6877522')
    multiplier = models.FloatField(default=2500.0)

    # Meter Telemetry (Present, Past, Consumed Units)
    kw_present = models.FloatField(default=0.0)
    kw_past = models.FloatField(default=0.0)
    kw_consumed = models.FloatField(default=0.0)

    kwh_present = models.FloatField(default=0.0)
    kwh_past = models.FloatField(default=0.0)
    kwh_consumed = models.FloatField(default=0.0)

    tou_kwh_present = models.FloatField(default=0.0)
    tou_kwh_past = models.FloatField(default=0.0)
    tou_kwh_consumed = models.FloatField(default=0.0)

    kvah_present = models.FloatField(default=0.0)
    kvah_past = models.FloatField(default=0.0)
    kvah_consumed = models.FloatField(default=0.0)

    slrt_present = models.FloatField(default=0.0)
    slrt_past = models.FloatField(default=0.0)
    slrt_consumed = models.FloatField(default=0.0)

    # Major Financial Charges (₹)
    total_bill_amount = models.FloatField(default=0.0)       # e.g. ₹ 1,50,48,480.00
    net_energy_charges = models.FloatField(default=0.0)      # e.g. ₹ 72,45,982.50
    fppas_charges = models.FloatField(default=0.0)           # e.g. ₹ 59,62,602.00
    demand_charges = models.FloatField(default=0.0)          # Demand / fixed charges
    electricity_duty = models.FloatField(default=0.0)        # Govt electricity duty / cess
    other_charges = models.FloatField(default=0.0)           # Rebates / reactive / miscellaneous

    # Security Deposit & Past Payment
    security_deposit_held = models.FloatField(default=15106279.0)     # ₹ 1,51,06,279.00
    additional_security_required = models.FloatField(default=3172600.0) # ₹ 31,72,600.00
    previous_payment_amount = models.FloatField(default=0.0)          # ₹ 1,51,88,126.00
    previous_payment_date = models.CharField(max_length=20, blank=True, default='')

    # Internal Substation Reconciliation
    internal_logged_kwh = models.FloatField(default=0.0)

    # Status & Audit
    status = models.CharField(max_length=30, default='Pending')  # Pending, Verified, Paid
    by = models.CharField(max_length=100, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    raw_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-month']
        verbose_name = 'Torrent Power Bill'
        verbose_name_plural = 'Torrent Power Bills'

    def __str__(self):
        return f"Torrent Bill {self.month} - ₹ {self.total_bill_amount:,.2f}"

    def save(self, *args, **kwargs):
        mult = float(self.multiplier if self.multiplier is not None and self.multiplier > 0 else 2500.0)

        # KW recorded demand
        if self.kw_present is not None and self.kw_present > 0:
            diff_kw = float(self.kw_present) - float(self.kw_past or 0.0) if self.kw_past else float(self.kw_present)
            self.kw_consumed = round(diff_kw * mult, 2)
            self.billing_demand_kw = self.kw_consumed

        # Active Energy KWH
        if self.kwh_present is not None and self.kwh_past is not None:
            diff_kwh = max(0.0, float(self.kwh_present) - float(self.kwh_past))
            self.kwh_consumed = round(diff_kwh * mult, 2)

        # Time of Use (TOU) Peak KWH
        if self.tou_kwh_present is not None and self.tou_kwh_past is not None:
            diff_tou = max(0.0, float(self.tou_kwh_present) - float(self.tou_kwh_past))
            self.tou_kwh_consumed = round(diff_tou * mult, 2)

        # Apparent Energy KVAH
        if self.kvah_present is not None and self.kvah_past is not None:
            diff_kvah = max(0.0, float(self.kvah_present) - float(self.kvah_past))
            self.kvah_consumed = round(diff_kvah * mult, 2)

        # SLRT
        if self.slrt_present is not None and self.slrt_past is not None:
            diff_slrt = max(0.0, float(self.slrt_present) - float(self.slrt_past))
            self.slrt_consumed = round(diff_slrt * mult, 2)

        # Power Factor calculation (KWH / KVAH * 100)
        if self.kvah_consumed > 0 and self.kwh_consumed > 0:
            calculated_pf = min(100.0, round((self.kwh_consumed / self.kvah_consumed) * 100.0, 2))
            if not self.avg_power_factor or self.avg_power_factor == 100.0:
                self.avg_power_factor = calculated_pf

        super().save(*args, **kwargs)

    @property
    def variance_kwh(self):
        """Variance between Torrent billed KWH and internal Substation panel logged KWH."""
        if self.internal_logged_kwh and self.internal_logged_kwh > 0:
            return round(self.kwh_consumed - self.internal_logged_kwh, 2)
        return 0.0

    @property
    def variance_pct(self):
        if self.internal_logged_kwh and self.internal_logged_kwh > 0:
            return round(((self.kwh_consumed - self.internal_logged_kwh) / self.internal_logged_kwh) * 100.0, 2)
        return 0.0

    @property
    def tou_ratio_pct(self):
        if self.kwh_consumed and self.kwh_consumed > 0:
            return round((self.tou_kwh_consumed / self.kwh_consumed) * 100.0, 2)
        return 0.0

    @property
    def cost_per_kwh(self):
        if self.kwh_consumed and self.kwh_consumed > 0 and self.total_bill_amount:
            return round(self.total_bill_amount / self.kwh_consumed, 3)
        return 0.0

    def to_dict(self):
        return {
            '_id': self.month,
            'id': self.month,
            'month': self.month,
            'billDate': self.bill_date,
            'readingDate': self.reading_date,
            'dueDate': self.due_date,
            'distributionDate': self.distribution_date,
            'billNo': self.bill_no,
            'customerId': self.customer_id,
            'tariff': self.tariff,
            'panNo': self.pan_no,
            'contractDemandKw': self.contract_demand_kw,
            'billingDemandKw': self.billing_demand_kw,
            'avgPowerFactor': self.avg_power_factor,
            'meterNo': self.meter_no,
            'multiplier': self.multiplier,

            # Meter Telemetry
            'kwPresent': self.kw_present,
            'kwPast': self.kw_past,
            'kwConsumed': self.kw_consumed,

            'kwhPresent': self.kwh_present,
            'kwhPast': self.kwh_past,
            'kwhConsumed': self.kwh_consumed,

            'touKwhPresent': self.tou_kwh_present,
            'touKwhPast': self.tou_kwh_past,
            'touKwhConsumed': self.tou_kwh_consumed,

            'kvahPresent': self.kvah_present,
            'kvahPast': self.kvah_past,
            'kvahConsumed': self.kvah_consumed,

            'slrtPresent': self.slrt_present,
            'slrtPast': self.slrt_past,
            'slrtConsumed': self.slrt_consumed,

            # Financials
            'totalBillAmount': self.total_bill_amount,
            'netEnergyCharges': self.net_energy_charges,
            'fppasCharges': self.fppas_charges,
            'demandCharges': self.demand_charges,
            'electricityDuty': self.electricity_duty,
            'otherCharges': self.other_charges,

            # Security Deposit & Past Payment
            'securityDepositHeld': self.security_deposit_held,
            'additionalSecurityRequired': self.additional_security_required,
            'previousPaymentAmount': self.previous_payment_amount,
            'previousPaymentDate': self.previous_payment_date,

            # Reconciliation & Derived Analytics
            'internalLoggedKwh': self.internal_logged_kwh,
            'varianceKwh': self.variance_kwh,
            'variancePct': self.variance_pct,
            'touRatioPct': self.tou_ratio_pct,
            'costPerKwh': self.cost_per_kwh,

            # Audit
            'status': self.status,
            'by': self.by,
            'remarks': self.remarks,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }
