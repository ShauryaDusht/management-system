import datetime
from decimal import Decimal
from django.db import models


def default_bank_details():
    return [
        ['Name of Account', 'IIT GANDHINAGAR INTERNAL REVENUE ACCOUNT'],
        ['Name of Branch', 'Canara Bank, IIT Gandhinagar Branch'],
        ['Account No.', '5159132000006'],
        ['Branch Code', '5159'],
        ['IFS/ RTGS Code', 'CNRB0005159'],
        ['MICR Code', '380015052'],
    ]


def calculate_fy_prefix(cycle_month=None):
    if cycle_month:
        try:
            parts = str(cycle_month).strip().split('-')
            year = int(parts[0])
            month = int(parts[1])
        except (ValueError, IndexError):
            today = datetime.date.today()
            year, month = today.year, today.month
    else:
        today = datetime.date.today()
        year, month = today.year, today.month

    if month >= 4:
        y1 = year % 100
        y2 = (year + 1) % 100
    else:
        y1 = (year - 1) % 100
        y2 = year % 100
    return f"IWD/{y1:02d}-{y2:02d}/"


class EstateSettings(models.Model):
    singleton = models.CharField(max_length=20, default='main', unique=True)
    headline = models.CharField(max_length=100, default='Demand Note')
    note_no_prefix = models.CharField(max_length=50, default='IWD/26-27/')
    auto_financial_year = models.BooleanField(
        default=True,
        help_text="Automatically update financial year in note prefix (e.g. IWD/26-27/)"
    )
    first_note_no = models.PositiveIntegerField(default=259)
    payment_note = models.TextField(
        default=(
            'The amount may be deposited to IIT Gandhinagar account and '
            'e-receipt be forwarded to accounts@iitgn.ac.in with copy to estateoffice@iitgn.ac.in'
        )
    )
    bank = models.JSONField(default=default_bank_details)
    signatory_name = models.CharField(max_length=100, default='Sujeet Kumar, SE')
    signatory_title = models.CharField(max_length=100, default='Estate Officer')
    expiry_alert_days = models.PositiveIntegerField(
        default=30,
        help_text="Days before agreement expiry to trigger alerts"
    )
    enable_email_alerts = models.BooleanField(
        default=False,
        help_text="Enable automated email notifications for clearance handovers"
    )
    test_recipient_email = models.CharField(
        max_length=150,
        blank=True,
        default='',
        help_text="If set, all clearance alert emails will be redirected here for safe testing"
    )
    civil_alert_email = models.CharField(
        max_length=150,
        blank=True,
        default='civil@iitgn.ac.in',
        help_text="Email for Civil Team clearance notifications"
    )
    electrical_alert_email = models.CharField(
        max_length=150,
        blank=True,
        default='electrical@iitgn.ac.in',
        help_text="Email for Electrical Team clearance notifications"
    )
    hk_alert_email = models.CharField(
        max_length=150,
        blank=True,
        default='manager.hk@iitgn.ac.in',
        help_text="Email for Housekeeping clearance notifications"
    )
    estate_alert_email = models.CharField(
        max_length=150,
        blank=True,
        default='estateoffice@iitgn.ac.in',
        help_text="Email for Estate Office final clearance notifications"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Estate Setting'
        verbose_name_plural = 'Estate Settings'

    def get_effective_prefix(self, cycle_month=None):
        if self.auto_financial_year:
            return calculate_fy_prefix(cycle_month)
        return self.note_no_prefix or 'IWD/26-27/'

    @classmethod
    def get_settings(cls):
        obj, created = cls.objects.get_or_create(singleton='main')
        return obj


class BillingCycle(models.Model):
    month = models.CharField(max_length=7, unique=True, help_text="Billing cycle formatted YYYY-MM")
    label = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-month']

    def __str__(self):
        return self.label or self.month


class Shop(models.Model):
    sl = models.PositiveIntegerField(default=1, db_index=True)
    name = models.CharField(max_length=200)
    address = models.TextField(
        default='Academic Block No-1,\nIIT Gandhinagar Campus,\nPalaj, Gandhinagar - 382 355'
    )
    fixed = models.BooleanField(default=False, help_text="True = fixed charges only (no units)")
    default_rate = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('9.55'))
    default_water = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('320.00'))
    expiry_date = models.CharField(
        max_length=10,
        blank=True,
        default='',
        help_text="Agreement/Contract expiry date in YYYY-MM-DD"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sl', 'id']

    def __str__(self):
        return f"{self.sl}. {self.name}"


class ShopDemandNote(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='demand_notes')
    cycle_month = models.CharField(max_length=7, db_index=True)
    date = models.CharField(max_length=10, blank=True, default='')  # YYYY-MM-DD
    month = models.CharField(max_length=7, blank=True, default='')  # YYYY-MM
    month_to = models.CharField(max_length=7, blank=True, default='')
    expiry_date = models.CharField(max_length=10, blank=True, default='', help_text="Bill expiry / payment due date in YYYY-MM-DD")
    note_no = models.CharField(max_length=100, blank=True, default='')
    units = models.CharField(max_length=40, blank=True, default='')
    rate = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('9.55'))
    water = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('320.00'))
    fixed = models.BooleanField(default=False)
    extras = models.JSONField(default=list)  # list of {"label": str, "amount": str}
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    is_cancelled = models.BooleanField(default=False, help_text="True if this shop's demand note was cancelled/skipped for this cycle")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['shop__sl', 'id']
        constraints = [
            models.UniqueConstraint(fields=['shop', 'cycle_month'], name='unique_shop_cycle')
        ]

    def __str__(self):
        return f"{self.shop.name} ({self.cycle_month})"


class Contractor(models.Model):
    sl = models.PositiveIntegerField(default=1, db_index=True)
    name = models.CharField(max_length=200)
    to_line = models.CharField(max_length=200, blank=True, default='')
    address = models.TextField(default='IITGN Project Circle, Palaj\nGandhinagar-382355')
    intro = models.TextField(
        default='Reimbursement of power consumption charges borne by the Institute for utilization of the premises:'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sl', 'id']

    def __str__(self):
        return f"{self.sl}. {self.name}"


class ContractorDemandNote(models.Model):
    contractor = models.ForeignKey(Contractor, on_delete=models.CASCADE, related_name='demand_notes')
    cycle_month = models.CharField(max_length=7, db_index=True)
    period_type = models.CharField(max_length=10, default='month')  # 'month' or 'range'
    date = models.CharField(max_length=10, blank=True, default='')
    month = models.CharField(max_length=7, blank=True, default='')
    month_to = models.CharField(max_length=7, blank=True, default='')
    from_date = models.CharField(max_length=10, blank=True, default='')
    to_date = models.CharField(max_length=10, blank=True, default='')
    note_no = models.CharField(max_length=100, blank=True, default='')
    meters = models.JSONField(default=list)  # list of {"label": str, "current": str, "previous": str, "rate": float}
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['contractor__sl', 'id']
        constraints = [
            models.UniqueConstraint(fields=['contractor', 'cycle_month'], name='unique_contractor_cycle')
        ]

    def __str__(self):
        return f"{self.contractor.name} ({self.cycle_month})"


class HousingUnit(models.Model):
    class Status(models.TextChoices):
        VACANT = 'vacant', 'Vacant'
        OCCUPIED = 'occupied', 'Occupied'
        UNDER_MAINTENANCE = 'under_maintenance', 'Under Maintenance'
        UNDER_CLEARANCE = 'under_clearance', 'Under Clearance'

    house_type = models.CharField(max_length=20, default='A', db_index=True, help_text="e.g. A, B, C, D, E, F")
    house_no = models.CharField(max_length=50, db_index=True, help_text="e.g. 01/101, 01/102, 31/108")
    block_no = models.CharField(max_length=20, blank=True, default='', help_text="Block/Building prefix e.g. 01, 02, 31")
    floor = models.CharField(max_length=10, blank=True, default='', help_text="Floor level e.g. 1, 2, 3, 4")
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.VACANT, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['house_type', 'house_no']
        constraints = [
            models.UniqueConstraint(fields=['house_type', 'house_no'], name='unique_housing_unit')
        ]
        verbose_name = 'Housing Unit'
        verbose_name_plural = 'Housing Units'

    def __str__(self):
        return f"{self.house_type} - {self.house_no} ({self.get_status_display()})"

    @property
    def current_allotment(self):
        return self.allotments.filter(is_active=True, is_current=True).first()


class HousingAllotment(models.Model):
    class Status(models.TextChoices):
        OCCUPIED = 'occupied', 'Occupied'
        VACATED = 'vacated', 'Vacated'
        RELOCATED = 'relocated', 'Relocated'
        UNDER_MAINTENANCE = 'under_maintenance', 'Under Maintenance'

    unit = models.ForeignKey(
        HousingUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='allotments'
    )
    sl = models.PositiveIntegerField(default=1, db_index=True)
    house_type = models.CharField(max_length=20, default='A', help_text="e.g. A, B, C, D...")
    house_no = models.CharField(max_length=50, help_text="e.g. 01/101, 01/102, 02/101...")
    occupant_name = models.CharField(max_length=200, help_text="Occupant's Name")
    empl_code = models.CharField(max_length=50, blank=True, default='', db_index=True, help_text="Employee Code e.g. 0136, C0101, CPWD")
    designation = models.CharField(max_length=150, blank=True, default='', help_text="Designation e.g. Professor")
    email = models.CharField(max_length=150, blank=True, default='', help_text="Email address")
    date_of_occupation = models.CharField(max_length=50, blank=True, default='', help_text="Date of occupation e.g. 8-Jun-26")
    al_issue_date = models.CharField(max_length=50, blank=True, default='', help_text="Allotment letter issue date e.g. 8-Jun-26")
    date_of_expiry = models.CharField(max_length=150, blank=True, default='', help_text="Expiry or condition e.g. PoE/Relocation, whichever is earlier")
    date_of_vacation = models.CharField(max_length=50, blank=True, default='', help_text="Date when unit was vacated")
    vacation_reason = models.CharField(max_length=200, blank=True, default='', help_text="e.g. Relocated to 01/302, Tenancy expired, etc.")
    is_current = models.BooleanField(default=True, db_index=True, help_text="True if currently active occupant")
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.OCCUPIED)
    remarks = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sl', 'id']
        verbose_name = 'Housing Allotment'
        verbose_name_plural = 'Housing Allotments'

    def __str__(self):
        status_suffix = " (Active)" if self.is_current else f" (Vacated {self.date_of_vacation})"
        return f"{self.house_type} - {self.house_no} : {self.occupant_name}{status_suffix}"


class HousingClearance(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    unit = models.ForeignKey(
        HousingUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='clearances'
    )
    sr_no = models.PositiveIntegerField(default=1, db_index=True)
    house_type = models.CharField(max_length=20, default='Type A', help_text="e.g. Type A, Type B, Type C, Type D")
    house_no = models.CharField(max_length=50, help_text="e.g. 02/303, 13/301")
    allottee_name = models.CharField(max_length=200, blank=True, default='', help_text="Name of allottee")
    empl_code = models.CharField(max_length=50, blank=True, default='', help_text="Employee Code of allottee")
    designation = models.CharField(max_length=150, blank=True, default='', help_text="Designation of allottee")
    email = models.CharField(max_length=150, blank=True, default='', help_text="Email of allottee")
    date_of_expiry = models.CharField(max_length=150, blank=True, default='', help_text="Tenure / Date of Expiry")
    time_stamp = models.CharField(max_length=50, blank=True, default='', help_text="e.g. 6-Jul-2026")
    key_handed_over_date = models.CharField(max_length=50, blank=True, default='', help_text="Key handed over to Civil team date")
    priority = models.CharField(max_length=20, blank=True, default='', help_text="Priority e.g. 1, 2, 3")
    # Civil team (Sheet Col H, I, J)
    civil_key_received_date = models.CharField(max_length=50, blank=True, default='', help_text="Civil: Key recieved on")
    civil_status = models.CharField(max_length=50, blank=True, default='', help_text="Civil: Status (e.g. completed, pending)")
    civil_completed_date = models.CharField(max_length=50, blank=True, default='', help_text="Civil: Key handed over on")

    # Electrical team (Sheet Col K, L, M)
    electrical_key_received_date = models.CharField(max_length=50, blank=True, default='', help_text="Electrical: Key recieved on")
    electrical_status = models.CharField(max_length=50, blank=True, default='', help_text="Electrical: Status")
    electrical_completed_date = models.CharField(max_length=50, blank=True, default='', help_text="Electrical: Key handed over on")

    # Housekeeping team (Sheet Col N, O, P)
    hk_handover_date = models.CharField(max_length=100, blank=True, default='', help_text="Housekeeping: Key recieved on")
    hk_status = models.CharField(max_length=50, blank=True, default='', help_text="Housekeeping: Status")
    hk_completed_date = models.CharField(max_length=100, blank=True, default='', help_text="Housekeeping: Key handed over on")

    # Estate office (Sheet Col Q, R, S, T)
    estate_date_1 = models.CharField(max_length=50, blank=True, default='', help_text="Estate: Allotment letter issued on")
    estate_date_2 = models.CharField(max_length=50, blank=True, default='', help_text="Estate: user accepted on")
    estate_date_3 = models.CharField(max_length=50, blank=True, default='', help_text="Estate: Key handed over to allottee")
    estate_date_4 = models.CharField(max_length=50, blank=True, default='', help_text="Estate: Last date of taking possession")
    remarks = models.TextField(blank=True, default='')
    civil_remarks = models.TextField(blank=True, default='', help_text="Civil team internal remarks")
    electrical_remarks = models.TextField(blank=True, default='', help_text="Electrical team internal remarks")
    hk_remarks = models.TextField(blank=True, default='', help_text="Housekeeping team internal remarks")
    estate_remarks = models.TextField(blank=True, default='', help_text="Estate office remarks")
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.IN_PROGRESS, db_index=True)
    is_allotted = models.BooleanField(default=False, db_index=True, help_text="True if officially allotted to an occupant")
    civil_is_locked = models.BooleanField(default=False, help_text="True if Civil completed and handed over")
    electrical_is_locked = models.BooleanField(default=False, help_text="True if Electrical completed and handed over")
    hk_is_locked = models.BooleanField(default=False, help_text="True if Housekeeping completed and handed over")
    admin_unlock_reason = models.TextField(blank=True, default='', help_text="Reason provided by Admin when reopening a department clearance")

    # Friendly property aliases matching exact Google Sheet column headers
    @property
    def civil_key_handed_over_date(self):
        return self.civil_completed_date

    @civil_key_handed_over_date.setter
    def civil_key_handed_over_date(self, val):
        self.civil_completed_date = val

    @property
    def electrical_key_handed_over_date(self):
        return self.electrical_completed_date

    @electrical_key_handed_over_date.setter
    def electrical_key_handed_over_date(self, val):
        self.electrical_completed_date = val

    @property
    def hk_key_received_date(self):
        return self.hk_handover_date

    @hk_key_received_date.setter
    def hk_key_received_date(self, val):
        self.hk_handover_date = val

    @property
    def hk_key_handed_over_date(self):
        return self.hk_completed_date

    @hk_key_handed_over_date.setter
    def hk_key_handed_over_date(self, val):
        self.hk_completed_date = val

    @property
    def allotment_letter_issued_date(self):
        return self.estate_date_1

    @allotment_letter_issued_date.setter
    def allotment_letter_issued_date(self, val):
        self.estate_date_1 = val

    @property
    def user_accepted_date(self):
        return self.estate_date_2

    @user_accepted_date.setter
    def user_accepted_date(self, val):
        self.estate_date_2 = val

    @property
    def key_handed_over_to_allottee_date(self):
        return self.estate_date_3

    @key_handed_over_to_allottee_date.setter
    def key_handed_over_to_allottee_date(self, val):
        self.estate_date_3 = val

    @property
    def possession_deadline_date(self):
        return self.estate_date_4

    @possession_deadline_date.setter
    def possession_deadline_date(self, val):
        self.estate_date_4 = val
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sr_no', 'id']
        verbose_name = 'Housing Clearance'
        verbose_name_plural = 'Housing Clearances'

    def __str__(self):
        return f"{self.sr_no}. {self.house_type} {self.house_no} - {self.allottee_name or 'Pending Allottee'}"
