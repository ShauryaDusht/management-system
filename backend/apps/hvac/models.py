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


PUMP_RATED_LIMITS = {
    # Primary Chilled Water Pumps
    'pri1': {'name': 'Primary Pump 1 (Trane)', 'max_v': 410.0, 'max_a': 21.5, 'range_v': '390-410V', 'range_a': '19-21.5A'},
    'pri2': {'name': 'Primary Pump 2 (Trane)', 'max_v': 410.0, 'max_a': 21.5, 'range_v': '390-410V', 'range_a': '19-21.5A'},
    'pri3': {'name': 'Primary Pump 3 (Trane)', 'max_v': 410.0, 'max_a': 21.5, 'range_v': '390-410V', 'range_a': '19-21.5A'},
    'pri4': {'name': 'Primary Pump 4 (Trane)', 'max_v': 410.0, 'max_a': 21.5, 'range_v': '390-410V', 'range_a': '19-21.5A'},
    'pri5': {'name': 'Primary Pump 5 (Carrier)', 'max_v': 425.0, 'max_a': 17.0, 'range_v': '405-425V', 'range_a': '15-17A'},
    'pri6': {'name': 'Primary Pump 6 (Carrier)', 'max_v': 425.0, 'max_a': 17.0, 'range_v': '405-425V', 'range_a': '15-17A'},
    'priNA1': {'name': 'Primary Pump NA 1', 'max_v': 416.0, 'max_a': 18.5, 'range_v': '414-416V', 'range_a': '18.5A'},
    'priNA2': {'name': 'Primary Pump NA 2', 'max_v': 416.0, 'max_a': 17.5, 'range_v': '414-416V', 'range_a': '17.5A'},
    'priNA3': {'name': 'Primary Pump NA 3 (Daikin)', 'max_v': 430.0, 'max_a': 19.0, 'range_v': '410-430V', 'range_a': '17-19A'},
    'priNA4': {'name': 'Primary Pump NA 4 (Daikin)', 'max_v': 430.0, 'max_a': 19.0, 'range_v': '411-430V', 'range_a': '18-19A'},

    # Secondary Chilled Water Pumps
    'sec1': {'name': 'Secondary Pump 1 (Trane)', 'max_v': 410.0, 'max_a': 50.0, 'range_v': '400-410V', 'range_a': '47-50A'},
    'sec2': {'name': 'Secondary Pump 2 (Trane)', 'max_v': 410.0, 'max_a': 50.0, 'range_v': '401-410V', 'range_a': '48-50A'},
    'sec3': {'name': 'Secondary Pump 3 (Trane)', 'max_v': 410.0, 'max_a': 50.0, 'range_v': '402-410V', 'range_a': '49-50A'},
    'sec4': {'name': 'Secondary Pump 4 (Trane)', 'max_v': 410.0, 'max_a': 50.0, 'range_v': '403-410V', 'range_a': '50A'},
    'sec5': {'name': 'Secondary Pump 5 (Hostel)', 'max_v': 420.0, 'max_a': 55.0, 'range_v': '410-420V', 'range_a': '45-55A'},
    'sec6': {'name': 'Secondary Pump 6 (Hostel)', 'max_v': 420.0, 'max_a': 55.0, 'range_v': '410-420V', 'range_a': '45-55A'},
    'sec7': {'name': 'Secondary Pump 7 (Hostel)', 'max_v': 420.0, 'max_a': 55.0, 'range_v': '410-420V', 'range_a': '45-55A'},
    'secNA1': {'name': 'Secondary Pump NA 1', 'max_v': 416.0, 'max_a': 65.5, 'range_v': '414-416V', 'range_a': '65.5A'},
    'secNA2': {'name': 'Secondary Pump NA 2', 'max_v': 416.0, 'max_a': 65.5, 'range_v': '414-416V', 'range_a': '65.5A'},
    'secNA3': {'name': 'Secondary Pump NA 3 (Daikin)', 'max_v': 430.0, 'max_a': 70.0, 'range_v': '410-430V', 'range_a': '62-70A'},
    'secNA4': {'name': 'Secondary Pump NA 4 (Daikin)', 'max_v': 430.0, 'max_a': 70.0, 'range_v': '410-430V', 'range_a': '62-70A'},

    # Condenser Water Pumps
    'con1': {'name': 'Condenser Pump 1 (Trane)', 'max_v': 415.0, 'max_a': 33.0, 'range_v': '400-415V', 'range_a': '29-33A'},
    'con2': {'name': 'Condenser Pump 2 (Trane)', 'max_v': 415.0, 'max_a': 33.0, 'range_v': '400-415V', 'range_a': '29-33A'},
    'con3': {'name': 'Condenser Pump 3 (Trane)', 'max_v': 415.0, 'max_a': 33.0, 'range_v': '400-415V', 'range_a': '29-33A'},
    'con4': {'name': 'Condenser Pump 4 (Trane)', 'max_v': 415.0, 'max_a': 33.0, 'range_v': '400-415V', 'range_a': '29-33A'},
    'con5': {'name': 'Condenser Pump 5 (Carrier)', 'max_v': 420.0, 'max_a': 47.0, 'range_v': '410-420V', 'range_a': '41-47A'},
    'con6': {'name': 'Condenser Pump 6 (Carrier)', 'max_v': 420.0, 'max_a': 47.0, 'range_v': '410-420V', 'range_a': '41-47A'},
    'conNA1': {'name': 'Condenser Pump NA 1', 'max_v': 416.0, 'max_a': 50.5, 'range_v': '414-416V', 'range_a': '50.4A'},
    'conNA2': {'name': 'Condenser Pump NA 2', 'max_v': 416.0, 'max_a': 50.4, 'range_v': '414-416V', 'range_a': '50.3A'},
    'conNA3': {'name': 'Condenser Pump NA 3 (Daikin)', 'max_v': 430.0, 'max_a': 52.0, 'range_v': '410-430V', 'range_a': '47-52A'},
    'conNA4': {'name': 'Condenser Pump NA 4 (Daikin)', 'max_v': 430.0, 'max_a': 52.0, 'range_v': '410-430V', 'range_a': '47-52A'},
}

CUSTOM_PUMP_RATINGS = {}


def get_active_pump_ratings():
    ratings = {}
    for k, v in PUMP_RATED_LIMITS.items():
        ratings[k] = dict(v)
        if k in CUSTOM_PUMP_RATINGS:
            ratings[k].update(CUSTOM_PUMP_RATINGS[k])
    return ratings


def check_alerts(values, include_pumps=True, custom_ratings=None):
    alerts = []
    if not isinstance(values, dict):
        return alerts

    # 1. Chiller Alerts
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

    # 2. Pump Rated Value Alerts (Supervisor & Engineer Portals Only)
    if include_pumps:
        active_limits = custom_ratings or get_active_pump_ratings()
        for p_key, limit in active_limits.items():
            a_val = values.get(f'{p_key}_a')
            if a_val is not None and a_val != '':
                try:
                    num_a = float(a_val)
                    if num_a >= limit['max_a']:
                        alerts.append(
                            f"{limit['name']}: Current ({num_a} A) reached/exceeds rated maximum ({limit['max_a']} A)"
                        )
                except (ValueError, TypeError):
                    pass

            v_val = values.get(f'{p_key}_v')
            if v_val is not None and v_val != '':
                try:
                    num_v = float(v_val)
                    if num_v >= limit['max_v']:
                        alerts.append(
                            f"{limit['name']}: Voltage ({num_v} V) reached/exceeds rated maximum ({limit['max_v']} V)"
                        )
                except (ValueError, TypeError):
                    pass

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
            'date': self.date.isoformat() if hasattr(self.date, 'isoformat') else str(self.date),
            'time': self.time,
            'slot': self.slot,
            'shift': str(self.shift),
            'operator': self.operator,
            'setpoint': self.setpoint,
            'ts': self.ts or int(self.created_at.timestamp() * 1000) if self.created_at else 0,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
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
