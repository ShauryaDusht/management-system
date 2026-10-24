from django.db import migrations


CANTEEN_GATE_AREA = "Canteen, Gate-01 and Gate-02"


def add_ashok_canteen_gate_area(apps, schema_editor):
    HKArea = apps.get_model("housekeeping", "HKArea")
    HKScheduleTemplate = apps.get_model("housekeeping", "HKScheduleTemplate")
    HKUserArea = apps.get_model("housekeeping", "HKUserArea")
    User = apps.get_model("users", "User")

    areas = list(HKArea.objects.filter(name=CANTEEN_GATE_AREA))
    if not areas:
        areas = [HKArea.objects.create(name=CANTEEN_GATE_AREA, area_type="guesthouse", is_active=True)]

    supervisor = User.objects.filter(username="ashok.rathod").first()
    for area in areas:
        updates = []
        if area.area_type != "guesthouse":
            area.area_type = "guesthouse"
            updates.append("area_type")
        if not area.is_active:
            area.is_active = True
            updates.append("is_active")
        if updates:
            area.save(update_fields=updates)

        if supervisor:
            HKUserArea.objects.get_or_create(user=supervisor, area=area)

        HKScheduleTemplate.objects.filter(
            area=area,
            worker_tag__in=["", "general"],
        ).update(worker_tag="floor")


class Migration(migrations.Migration):

    dependencies = [
        ("housekeeping", "0023_hktemporarystaffareaassignment"),
    ]

    operations = [
        migrations.RunPython(add_ashok_canteen_gate_area, migrations.RunPython.noop),
    ]
