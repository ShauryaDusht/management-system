from django.db import migrations


TEMP_NOTE = "Temporary task: excluded from progress until selected."
SATURDAY_COPY_NOTE = "Saturday permanent coverage copied from ground-floor Saturday plan."


def _append_note(text, note):
    text = (text or "").strip()
    if note in text:
        return text
    return f"{text} | {note}".strip(" |") if text else note


def _copy_research_park_saturday_tasks(apps):
    HKArea = apps.get_model("housekeeping", "HKArea")
    HKScheduleTemplate = apps.get_model("housekeeping", "HKScheduleTemplate")

    area = HKArea.objects.filter(name="Research Park").first()
    if not area:
        return

    source_templates = list(
        HKScheduleTemplate.objects.filter(
            area=area,
            frequency="saturday_special",
            is_active=True,
            is_optional_weekend_task=False,
        )
        .exclude(task_name__icontains="Tea Break")
        .exclude(task_name__icontains="Lunch Break")
        .order_by("order", "start_time", "id")
    )

    targets = (
        ("room", "2nd Floor"),
        ("washroom", "3rd Floor"),
    )
    for template in source_templates:
        base_name = template.task_name or ""
        for offset, (worker_tag, floor_label) in enumerate(targets, start=1):
            task_name = f"{floor_label}: {base_name}"
            HKScheduleTemplate.objects.update_or_create(
                area=area,
                frequency="saturday_special",
                worker_tag=worker_tag,
                task_name=task_name,
                defaults={
                    "order": (template.order or 0) + (offset * 100),
                    "start_time": template.start_time,
                    "end_time": template.end_time,
                    "task_description": _append_note(template.task_description, SATURDAY_COPY_NOTE),
                    "requires_photo": template.requires_photo,
                    "is_optional_weekend_task": False,
                    "is_active": True,
                },
            )


def _make_block_tasks_temporary(apps):
    HKScheduleTemplate = apps.get_model("housekeeping", "HKScheduleTemplate")

    specs = (
        ("Block E", "Staircase"),
        ("E Block", "Staircase"),
        ("Block D", "Washroom"),
        ("D Block", "Washroom"),
    )
    for area_text, task_text in specs:
        qs = HKScheduleTemplate.objects.filter(
            area__name__icontains=area_text,
            task_name__icontains=task_text,
            is_active=True,
        )
        for template in qs:
            template.frequency = "saturday_special"
            template.worker_tag = "all"
            template.is_optional_weekend_task = True
            template.task_description = _append_note(template.task_description, TEMP_NOTE)
            template.save(
                update_fields=[
                    "frequency",
                    "worker_tag",
                    "is_optional_weekend_task",
                    "task_description",
                ]
            )


def apply_updates(apps, schema_editor):
    _copy_research_park_saturday_tasks(apps)
    _make_block_tasks_temporary(apps)


class Migration(migrations.Migration):

    dependencies = [
        ("housekeeping", "0025_normalize_research_park_breaks"),
    ]

    operations = [
        migrations.RunPython(apply_updates, migrations.RunPython.noop),
    ]
