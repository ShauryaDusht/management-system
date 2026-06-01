from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("housekeeping", "0020_backfill_worker_phone_contacts"),
    ]

    operations = [
        migrations.AlterField(
            model_name="hkextrawork",
            name="worker_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="hkextrawork",
            name="assigned_workers",
            field=models.ManyToManyField(
                blank=True,
                related_name="extra_work_logs",
                to="housekeeping.hkworker",
            ),
        ),
    ]
