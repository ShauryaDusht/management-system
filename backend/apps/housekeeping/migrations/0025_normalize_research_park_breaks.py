import datetime

from django.db import migrations


def time_after(start_time, minutes):
    start_dt = datetime.datetime.combine(datetime.date.today(), start_time)
    return (start_dt + datetime.timedelta(minutes=minutes)).time()


def normalize_research_park_breaks(apps, schema_editor):
    HKArea = apps.get_model("housekeeping", "HKArea")
    HKScheduleTemplate = apps.get_model("housekeeping", "HKScheduleTemplate")

    area = HKArea.objects.filter(name="Research Park").first()
    if not area:
        return

    for label, minutes, start_time in (
        ("Tea Break", 15, datetime.time(10, 30)),
        ("Lunch Break", 60, datetime.time(13, 0)),
    ):
        templates = list(
            HKScheduleTemplate.objects.filter(
                area=area,
                frequency="daily",
                is_active=True,
                task_name__icontains=label,
            ).order_by("start_time", "order", "id")
        )

        if not templates:
            HKScheduleTemplate.objects.create(
                area=area,
                order=98 if label == "Tea Break" else 99,
                start_time=start_time,
                end_time=time_after(start_time, minutes),
                task_name=label,
                task_description="Days: Monday to Friday",
                worker_tag="all",
                requires_photo=False,
                frequency="daily",
                is_active=True,
            )
            continue

        keep = templates[0]
        keep.task_name = label
        keep.start_time = start_time
        keep.end_time = time_after(start_time, minutes)
        keep.task_description = "Days: Monday to Friday"
        keep.worker_tag = "all"
        keep.requires_photo = False
        keep.save(update_fields=["task_name", "start_time", "end_time", "task_description", "worker_tag", "requires_photo"])

        for duplicate in templates[1:]:
            duplicate.is_active = False
            duplicate.requires_photo = False
            duplicate.worker_tag = "archived"
            duplicate.save(update_fields=["is_active", "requires_photo", "worker_tag"])


class Migration(migrations.Migration):

    dependencies = [
        ("housekeeping", "0024_add_ashok_canteen_gate_area"),
    ]

    operations = [
        migrations.RunPython(normalize_research_park_breaks, migrations.RunPython.noop),
    ]
