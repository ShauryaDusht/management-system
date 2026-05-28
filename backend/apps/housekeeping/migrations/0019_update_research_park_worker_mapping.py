from django.db import migrations


RESEARCH_PARK_SCHEDULES = [
    (1, "08:00", "08:30", "Dhaval: GF + 3F Gents and Handicap Washroom Touch Up", ""),
    (2, "08:30", "09:00", "Dhaval: Admin Office Cleaning", ""),
    (3, "09:00", "09:20", "Dhaval: Board Room Cleaning", ""),
    (4, "09:20", "10:00", "Dhaval: Fountain Common Area Cleaning", ""),
    (5, "10:00", "10:15", "Dhaval: Tea Break", ""),
    (6, "10:15", "11:00", "Dhaval: Classroom Cleaning", ""),
    (7, "11:00", "12:15", "Dhaval: GF + 3F Gents and Handicap Washroom Cleaning", ""),
    (8, "12:15", "13:00", "Dhaval: Conference Room Cleaning", ""),
    (9, "13:00", "14:00", "Dhaval: Lunch Break", ""),
    (10, "14:00", "14:30", "Dhaval: GF + 3F Washroom Touch Up", ""),
    (11, "14:30", "16:30", "Dhaval: Building Inside 2 Staircase + Railing Dusting", ""),
    (12, "16:30", "17:00", "Dhaval: GF + 3F Washroom Touch Up", ""),
    (13, "09:00", "09:45", "Mahesh: 2 Office Cleaning", "Senior shift 9:00 AM to 6:00 PM"),
    (14, "09:45", "11:15", "Mahesh: Ground Floor Cleaning", ""),
    (15, "11:15", "11:30", "Mahesh: Tea Break", ""),
    (16, "11:30", "12:00", "Mahesh: 1 Office Cleaning", ""),
    (17, "12:00", "12:30", "Mahesh: Ground Floor All Dusting", ""),
    (18, "12:30", "13:00", "Mahesh: Lift and CCTV Room Cleaning", ""),
    (19, "13:00", "14:00", "Mahesh: Lunch Break", ""),
    (20, "14:00", "14:30", "Mahesh: Ground Floor Touch Up", ""),
    (21, "14:30", "15:15", "Mahesh: 2 Office Cleaning", ""),
    (22, "15:15", "16:00", "Mahesh: Building Inside Staircase + Railing Dusting", ""),
    (23, "16:00", "17:30", "Mahesh: Building Outside 2 Staircase + Railing Dusting", ""),
    (24, "17:30", "18:00", "Mahesh: All Floor Gents Washroom Touch Up", ""),
]


def _time(value):
    import datetime

    return datetime.datetime.strptime(value, "%H:%M").time()


def _dhaval_pay_code(HKWorker, dhaval_id=None):
    qs = HKWorker.objects.filter(pay_code="484")
    if dhaval_id:
        qs = qs.exclude(pk=dhaval_id)
    return "484.2" if qs.exists() else "484"


def apply_worker_mapping(apps, schema_editor):
    HKArea = apps.get_model("housekeeping", "HKArea")
    HKWorker = apps.get_model("housekeeping", "HKWorker")
    HKScheduleTemplate = apps.get_model("housekeeping", "HKScheduleTemplate")
    User = apps.get_model("users", "User")

    area = HKArea.objects.filter(name="Research Park").first()
    if not area:
        return

    supervisor = User.objects.filter(username="maulik.patel").first()

    mahesh = HKWorker.objects.filter(area=area, name="Mahesh Solanki").first()
    if mahesh:
        mahesh.worker_type = "floor"
        mahesh.shift = "day"
        mahesh.is_reliever = False
        mahesh.is_active = True
        if supervisor:
            mahesh.supervisor = supervisor
        mahesh.save(update_fields=["worker_type", "shift", "is_reliever", "is_active", "supervisor"])

    HKWorker.objects.filter(
        area=area,
        name__in=["Thakor Ajaykumar Prahladji", "Ajay Thakor"],
    ).update(is_active=False)

    dhaval = HKWorker.objects.filter(area=area, name="Dhaval S Solanki").first()
    if not dhaval:
        dhaval = HKWorker(area=area, name="Dhaval S Solanki")
    dhaval.pay_code = _dhaval_pay_code(HKWorker, dhaval.pk)
    dhaval.phone = dhaval.phone or ""
    dhaval.worker_type = "floor"
    dhaval.shift = "day"
    dhaval.is_reliever = False
    dhaval.is_active = True
    if supervisor:
        dhaval.supervisor = supervisor
    dhaval.save()

    for order, start, end, task_name, task_description in RESEARCH_PARK_SCHEDULES:
        HKScheduleTemplate.objects.filter(
            area=area,
            worker_tag="floor",
            order=order,
        ).update(
            start_time=_time(start),
            end_time=_time(end),
            task_name=task_name,
            task_description=task_description,
            is_active=True,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("housekeeping", "0001_squashed_0018_fix_encoding_artifacts"),
    ]

    operations = [
        migrations.RunPython(apply_worker_mapping, migrations.RunPython.noop),
    ]
