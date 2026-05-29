from django.db import migrations


def backfill_worker_phones(apps, schema_editor):
    HKWorker = apps.get_model("housekeeping", "HKWorker")

    workers = list(HKWorker.objects.all().order_by("id"))
    phone_by_pay_code = {}
    phone_by_name = {}

    for worker in workers:
        phone = (worker.phone or "").strip()
        if not phone:
            continue

        pay_code = (worker.pay_code or "").strip()
        if pay_code and pay_code not in phone_by_pay_code:
            phone_by_pay_code[pay_code] = phone

        name_key = (worker.name or "").strip().lower()
        if name_key and name_key not in phone_by_name:
            phone_by_name[name_key] = phone

    for worker in workers:
        if (worker.phone or "").strip():
            continue

        pay_code = (worker.pay_code or "").strip()
        name_key = (worker.name or "").strip().lower()
        phone = phone_by_pay_code.get(pay_code) or phone_by_name.get(name_key)
        if not phone:
            continue

        worker.phone = phone
        worker.save(update_fields=["phone"])


class Migration(migrations.Migration):

    dependencies = [
        ("housekeeping", "0019_update_research_park_worker_mapping"),
    ]

    operations = [
        migrations.RunPython(backfill_worker_phones, migrations.RunPython.noop),
    ]
