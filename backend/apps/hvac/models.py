from django.db import models
from django.utils import timezone


CHILLERS = [
    (1, 'Trane 1', 305),
    (2, 'Trane 2', 305),
    (3, 'Trane 3', 305),
    (4, 'Trane 4', 305),
    (5, 'Carrier 5', 600),
    (6, 'Daikin 6', 605),
    (7, 'Daikin 7', 605),
]


def check_alerts(values):
    alerts = []
    if not isinstance(values, dict):
        return alerts

    for n, name, _ in CHILLERS:
        prefix = f'c{n}_'
        is_on = values.get(f'{prefix}st') == 'on' or (
            values.get(f'{prefix}st') is None and values.get(f'{prefix}evapOut') is not None
        )
        if not is_on:
            continue

        evap_in = values.get(f'{prefix}evapIn')
        evap_out = values.get(f'{prefix}evapOut')
        if evap_in is not None and evap_out is not None:
            try:
                dt = round(float(evap_in) - float(evap_out), 2)
                if dt > 4.0:
                    alerts.append(f"{name}: Delta T ({dt}°C) is high (> 4°C) [Entering: {evap_in}°C, Leaving: {evap_out}°C]")
            except (ValueError, TypeError):
                pass

        if evap_out is not None:
            try:
                if float(evap_out) > 9.0:
                    alerts.append(f"{name}: evaporator leaving {evap_out}°C is high (> 9°C)")
            except (ValueError, TypeError):
                pass

        cond_in = values.get(f'{prefix}condIn')
        if cond_in is not None:
            try:
                if float(cond_in) > 33.0:
                    alerts.append(f"{name}: condenser entering {cond_in}°C is high")
            except (ValueError, TypeError):
                pass

        oil_l = values.get(f'{prefix}oilL')
        if oil_l and str(oil_l).lower() != 'wet':
            alerts.append(f"{name}: oil level sensor reads {oil_l}")

    return alerts


def derive_values(values):
    if not isinstance(values, dict):
        return {}
    res = dict(values)
    for n, _, _ in CHILLERS:
        prefix = f'c{n}_'
        ein = res.get(f'{prefix}evapIn')
        eout = res.get(f'{prefix}evapOut')
        if ein is not None and eout is not None:
            try:
                res[f'{prefix}dt'] = round(float(ein) - float(eout), 2)
            except (ValueError, TypeError):
                pass
    return res


class HvacLog(models.Model):
    id = models.CharField(max_length=60, primary_key=True)  # e.g. 2024-09-01_0830
    date = models.DateField(db_index=True)
    time = models.CharField(max_length=10)  # e.g. 08:30
    slot = models.IntegerField(db_index=True)  # 0 to 23
    shift = models.CharField(max_length=10, db_index=True)  # '1', '2', '3'
    operator = models.CharField(max_length=100, blank=True)
    setpoint = models.FloatField(null=True, blank=True)
    values = models.JSONField(default=dict, blank=True)
    ts = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ['date', 'slot']
        indexes = [
            models.Index(fields=['date', 'slot']),
            models.Index(fields=['date', 'shift']),
        ]
        verbose_name = 'HVAC Hourly Log'
        verbose_name_plural = 'HVAC Hourly Logs'

    def __str__(self):
        return f"HVAC {self.date} {self.time} (Shift {self.shift}) - {self.operator}"

    @property
    def alerts(self):
        return check_alerts(self.values)

    @property
    def derived_values(self):
        return derive_values(self.values)

    def to_dict(self):
        return {
            '_id': self.id,
            'id': self.id,
            'date': self.date.isoformat(),
            'time': self.time,
            'slot': self.slot,
            'shift': str(self.shift),
            'operator': self.operator,
            'setpoint': self.setpoint,
            'ts': self.ts or int(self.created_at.timestamp() * 1000) if self.created_at else 0,
            'v': self.derived_values,
            'alerts': self.alerts,
        }


class HvacSupervisorLog(models.Model):
    date = models.DateField(db_index=True)
    shift = models.CharField(max_length=10, db_index=True)  # '1', '2', '3', or 'day'
    status = models.CharField(max_length=30, default='Normal')  # Normal, Attention Needed, Critical
    chillers_checked = models.BooleanField(default=True)
    pumps_checked = models.BooleanField(default=True)
    towers_checked = models.BooleanField(default=True)
    panels_checked = models.BooleanField(default=True)
    water_checked = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    supervisor_name = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-shift']
        unique_together = ('date', 'shift')
        verbose_name = 'HVAC Shift Engineer Handover'
        verbose_name_plural = 'HVAC Shift Engineer Handovers'

    def __str__(self):
        return f"HVAC Handover {self.date} Shift {self.shift} - {self.status}"

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat(),
            'shift': self.shift,
            'status': self.status,
            'chillersChecked': self.chillers_checked,
            'pumpsChecked': self.pumps_checked,
            'towersChecked': self.towers_checked,
            'panelsChecked': self.panels_checked,
            'waterChecked': self.water_checked,
            'notes': self.notes,
            'supervisorName': self.supervisor_name,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }
