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
