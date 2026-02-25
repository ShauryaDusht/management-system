from django.db import models
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

    name = models.CharField(max_length=200)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='items')
    item_type = models.CharField(max_length=20, choices=ItemType.choices)
    unit = models.CharField(max_length=20, choices=Unit.choices, default=Unit.PIECES)
    total_quantity = models.PositiveIntegerField(default=0)
    available_quantity = models.PositiveIntegerField(default=0)
    threshold_quantity = models.PositiveIntegerField(
        default=10,
        help_text='Alert admin when available quantity falls below this number.'
    )
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_item_type_display()})"

    @property
    def is_below_threshold(self):
        return self.available_quantity < self.threshold_quantity

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
    quantity_added = models.PositiveIntegerField()
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
            # Update item stock counts atomically
            Item.objects.filter(pk=self.item_id).update(
                available_quantity=models.F('available_quantity') + self.quantity_added,
                total_quantity=models.F('total_quantity') + self.quantity_added,
            )


class ItemRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        ISSUED = 'issued', 'Issued'

    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='requests')
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='requests_made',
        limit_choices_to={'role': 'supervisor'},
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='requests_reviewed',
        limit_choices_to={'role': 'manager'},
    )
    quantity_requested = models.PositiveIntegerField()
    purpose = models.TextField(help_text='What will this item be used for?')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f"{self.requested_by} → {self.item.name} x{self.quantity_requested} [{self.status}]"


class ItemIssue(models.Model):
    """
    Phase 2 additions to existing model:
      - actual_quantity_used   : consumables — how much was really consumed
      - usage_finalized        : supervisor marks consumable usage as complete
      - usage_finalized_at     : timestamp of finalization
      - return_recorded_by     : manager who recorded the asset return
    """
    request = models.OneToOneField(ItemRequest, on_delete=models.PROTECT, related_name='issue')
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='issues_made',
    )
    issued_quantity = models.PositiveIntegerField()
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

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-issued_at']

    def __str__(self):
        return f"Issue #{self.id} — {self.request.item.name} x{self.issued_quantity}"
