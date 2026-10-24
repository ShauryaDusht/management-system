from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Coalesce
from django.core.validators import MinValueValidator
from decimal import Decimal
from django.conf import settings


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Item(models.Model):
    class ItemType(models.TextChoices):
        ASSET = 'asset', 'Asset'
        CONSUMABLE = 'consumable', 'Consumable'

    class Unit(models.TextChoices):
        PIECES = 'pieces', 'Pieces'
        LITRES = 'litres', 'Litres'
        KG = 'kg', 'Kilograms'
        METRES = 'metres', 'Metres'
        PACKETS = 'packets', 'Packets'
        BOTTLES = 'bottles', 'Bottles'
        BOXES = 'boxes', 'Boxes'
        EACH = 'Each', 'Each'
        LTR = 'Ltr', 'Ltr'
        KG_LEGACY = 'Kg', 'Kg'
        PACKET = 'Packet', 'Packet'
        PAIR = 'Pair', 'Pair'
        ROLL = 'Roll', 'Roll'

    name = models.CharField(max_length=200)
    item_code = models.CharField(max_length=50, blank=True, null=True, unique=True, help_text='Unique identifier like 3.01 or 4.11')
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='items')
    item_type = models.CharField(max_length=20, choices=ItemType.choices)
    unit = models.CharField(max_length=20, choices=Unit.choices, default=Unit.PIECES)
    total_quantity = models.PositiveIntegerField(default=0)
    available_quantity = models.PositiveIntegerField(default=0)
    reserved_quantity = models.PositiveIntegerField(default=0)
    threshold_quantity = models.PositiveIntegerField(
        default=10,
        help_text='Alert admin when available quantity falls below this number.'
    )
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']
        constraints = [
            models.CheckConstraint(
                check=models.Q(available_quantity__lte=models.F('total_quantity')),
                name='inventory_item_available_lte_total',
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_item_type_display()})"

    def clean(self):
        # prevent creating/updating an item where available_quantity
        if (
            self.available_quantity is not None
            and self.total_quantity is not None
            and self.available_quantity > self.total_quantity
        ):
            raise ValidationError({
                'available_quantity': (
                    f'Available quantity ({self.available_quantity}) cannot exceed '
                    f'total quantity ({self.total_quantity}).'
                )
            })

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

    @property
    def is_below_threshold(self):
        return 0 < self.available_quantity <= self.threshold_quantity

    @property
    def status(self):
        if self.available_quantity == 0:
            return 'out_of_stock'
        if self.is_below_threshold:
            return 'low_stock'
        return 'in_stock'


class StockEntry(models.Model):
    """
    Records every time new stock arrives for an item (replenishment).
    Gives admin full audit trail of all stock additions.
    When saved, automatically increases item.available_quantity and item.total_quantity.
    """
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='stock_entries')
    quantity_added = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='stock_entries_made',
    )
    added_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, help_text='e.g. Received from contractor, 5th March')

    class Meta:
        ordering = ['-added_at']

    def __str__(self):
        return f"+{self.quantity_added} {self.item.unit} → {self.item.name} ({self.added_at.date()})"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            # This is a single atomic SQL UPDATE and avoids any possibility of
            # double-incrementing from stale in-memory item instances.
            Item.objects.filter(pk=self.item_id).update(
                available_quantity=models.F('available_quantity') + self.quantity_added,
                total_quantity=models.F('total_quantity') + self.quantity_added,
            )

    def delete(self, *args, **kwargs):
        quantity_added = self.quantity_added
        item_id = self.item_id
        super().delete(*args, **kwargs)
        Item.objects.filter(pk=item_id).update(
            available_quantity=models.F('available_quantity') - quantity_added,
            total_quantity=models.F('total_quantity') - quantity_added,
        )


class ItemRequestBatch(models.Model):
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='item_request_batches',
        limit_choices_to={'role__in': ['supervisor', 'caretaker']},
    )
    purpose = models.TextField(help_text='What will these items be used for?')
    notes = models.TextField(blank=True)
    is_urgent = models.BooleanField(default=False)
    requested_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        if not self.pk:
            return f"New batch by {self.requested_by}"
        return f"Batch #{self.id} by {self.requested_by} ({self.requests.count()} items)"


class ItemRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        ISSUED = 'issued', 'Issued'

    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='requests')
    batch = models.ForeignKey(
        ItemRequestBatch,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='requests',
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='requests_made',
        limit_choices_to={'role__in': ['supervisor', 'caretaker']},
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='requests_reviewed',
        limit_choices_to={'role__in': ['inventory_manager', 'admin']},
    )
    # Enforce minimum quantity of 1
    quantity_requested = models.PositiveIntegerField(
        validators=[MinValueValidator(0)]
    )

    units_remaining = models.PositiveIntegerField(
        default=0,
        help_text='Snapshot of available stock at the time the request was reviewed (approved/rejected).'
    )
    purpose = models.TextField(help_text='What will this item be used for?')
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    is_urgent = models.BooleanField(default=False)
    rejection_reason = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"{self.requested_by} → {self.item.name} x{self.quantity_requested} [{self.status}]"

    # Convenience aliases kept for backward compatibility
    @property
    def requester(self):
        return self.requested_by

    @property
    def reviewed_by(self):
        return self.approved_by

    @property
    def reason(self):
        return self.purpose

    @property
    def created_at(self):
        return self.requested_at

    @property
    def updated_at(self):
        return self.reviewed_at or self.requested_at

    def requisition_lines(self):
        lines = list(self.requisition_items.select_related('inventory_item').all())
        if lines:
            return lines
        return [
            RequisitionItem(
                requisition=self,
                inventory_item=self.item,
                quantity=self.quantity_requested,
                unit=self.item.unit,
            )
        ]


class RequisitionItem(models.Model):
    requisition = models.ForeignKey(
        ItemRequest,
        on_delete=models.CASCADE,
        related_name='requisition_items',
    )
    inventory_item = models.ForeignKey(
        Item,
        on_delete=models.PROTECT,
        related_name='requisition_lines',
    )
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'requisition_items'
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['requisition', 'inventory_item'],
                name='unique_requisition_inventory_item',
            ),
        ]

    def __str__(self):
        return f"Req #{self.requisition_id} - {self.inventory_item.name} x{self.quantity}"


class PurchaseRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    class Urgency(models.TextChoices):
        NORMAL = 'normal', 'Normal'
        HIGH = 'high', 'High'

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='purchase_requests_made',
        limit_choices_to={'role__in': ['inventory_manager', 'admin']},
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_requests',
    )
    item_name = models.CharField(max_length=200)
    item_type = models.CharField(
        max_length=20,
        choices=Item.ItemType.choices,
        default=Item.ItemType.CONSUMABLE,
    )
    quantity_requested = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit = models.CharField(max_length=30, default='pieces')
    estimated_unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reason = models.TextField(help_text='Why this purchase is needed.')
    needed_by = models.DateField(null=True, blank=True)
    urgency = models.CharField(max_length=10, choices=Urgency.choices, default=Urgency.NORMAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    admin_note = models.TextField(blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_requests_decided',
        limit_choices_to={'role': 'admin'},
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"PR-{self.id} {self.item_name} x{self.quantity_requested} [{self.status}]"

    @property
    def estimated_total_cost(self):
        if self.estimated_unit_cost is None:
            return None
        return self.estimated_unit_cost * self.quantity_requested


class ItemIssue(models.Model):
    """
    Tracks the physical issuing of items, asset returns, and consumable finalization.
    """
    request = models.OneToOneField(ItemRequest, on_delete=models.PROTECT, related_name='issue')
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='issues_made',
    )
    issued_quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    issued_at = models.DateTimeField(auto_now_add=True)

    # ── Asset return tracking ──────────────────────────────────
    expected_return_date = models.DateField(null=True, blank=True)
    returned_quantity = models.PositiveIntegerField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    condition_on_return = models.TextField(blank=True)
    return_recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='returns_recorded',
    )

    # ── Consumable finalization ────────────────────────────────
    actual_quantity_used = models.PositiveIntegerField(null=True, blank=True)
    usage_finalized = models.BooleanField(default=False)
    usage_finalized_at = models.DateTimeField(null=True, blank=True)

    # ── Reversal and adjustment tracking ──────────────────────
    original_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='Original issued quantity before any adjustments or reversal.',
    )
    is_reversed = models.BooleanField(default=False)
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='issues_reversed',
    )
    reversal_reason = models.TextField(blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-issued_at']

    def __str__(self):
        status_suffix = " [REVERSED]" if self.is_reversed else ""
        return f"Issue #{self.id} — {self.request.item.name} x{self.issued_quantity}{status_suffix}"


class ItemIssueAdjustment(models.Model):
    """
    Audit log of all reversals and quantity corrections performed on an ItemIssue.
    """
    class ActionType(models.TextChoices):
        REVERSAL = 'reversal', 'Undo Entire Approval'
        ADJUSTMENT = 'adjustment', 'Quantity Adjustment'

    issue = models.ForeignKey(
        ItemIssue,
        on_delete=models.CASCADE,
        related_name='adjustments',
    )
    action_type = models.CharField(
        max_length=20,
        choices=ActionType.choices,
        default=ActionType.ADJUSTMENT,
    )
    previous_quantity = models.PositiveIntegerField()
    new_quantity = models.PositiveIntegerField()
    quantity_returned_to_stock = models.PositiveIntegerField(
        default=0,
        help_text='Quantity added back to warehouse available stock.'
    )
    reason = models.TextField()
    adjusted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='issue_adjustments',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f"Adjustment #{self.id} on Issue #{self.issue_id}: "
            f"{self.previous_quantity} -> {self.new_quantity} ({self.action_type})"
        )


class ItemUsageLog(models.Model):
    issue = models.ForeignKey(ItemIssue, on_delete=models.CASCADE, related_name='usage_logs')
    quantity_used = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    purpose = models.TextField()
    notes = models.TextField(blank=True, default='')
    logged_at = models.DateTimeField(auto_now_add=True)
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='item_usage_logs',
    )

    class Meta:
        ordering = ['-logged_at']

    def clean(self):
        super().clean()
        if self.quantity_used is not None:
            if self.quantity_used <= Decimal('0.00'):
                raise ValidationError({'quantity_used': 'Quantity must be greater than 0.'})
            if self.issue_id:
                consumed = ItemUsageLog.objects.filter(issue_id=self.issue_id).exclude(pk=self.pk).aggregate(
                    total=Coalesce(
                        models.Sum('quantity_used'),
                        models.Value(0),
                        output_field=models.DecimalField(max_digits=10, decimal_places=2),
                    )
                )['total'] or Decimal('0.00')
                issued_qty = Decimal(self.issue.issued_quantity)
                remaining = issued_qty - consumed
                if self.quantity_used > remaining:
                    rem_display = max(Decimal('0.00'), remaining).quantize(Decimal('0.01'))
                    unit = getattr(getattr(self.issue.request, 'item', None), 'unit', '')
                    raise ValidationError({
                        'quantity_used': f'Cannot exceed remaining quantity ({rem_display} {unit}).'.strip()
                    })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Usage #{self.id} — {self.quantity_used} for Issue #{self.issue_id}"
