# Generated manually for safe staged rollout of submission_id and PlantRecordPhoto
import os
import uuid
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def backfill_submission_ids(apps, schema_editor):
    PlantRecord = apps.get_model('geo_tracker', 'PlantRecord')
    PlantRecordPhoto = apps.get_model('geo_tracker', 'PlantRecordPhoto')

    for record in PlantRecord.objects.all():
        if not record.submission_id:
            record.submission_id = uuid.uuid4()
            record.save(update_fields=['submission_id'])

        # Backfill existing primary photo into PlantRecordPhoto if not already present
        if record.photo and not PlantRecordPhoto.objects.filter(record=record).exists():
            fname = os.path.basename(record.photo.name) if record.photo.name else ''
            PlantRecordPhoto.objects.create(
                photo_id=uuid.uuid4(),
                record=record,
                photo=record.photo,
                original_filename=fname,
                uploaded_at=record.submitted_at or django.utils.timezone.now(),
            )


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0018_plantrecord_area_shape_plantrecord_plant_count_and_more'),
    ]

    operations = [
        # 1. Create PlantRecordPhoto model
        migrations.CreateModel(
            name='PlantRecordPhoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('photo_id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, help_text='Unique photograph UUID for idempotent upload', unique=True)),
                ('photo', models.ImageField(upload_to='geo_tracker/photos/')),
                ('original_filename', models.CharField(blank=True, max_length=255)),
                ('file_size', models.PositiveIntegerField(blank=True, help_text='File size in bytes', null=True)),
                ('mime_type', models.CharField(blank=True, help_text='MIME type (e.g. image/jpeg)', max_length=50)),
                ('uploaded_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('record', models.ForeignKey(help_text='Associated plant record', on_delete=django.db.models.deletion.CASCADE, related_name='photos', to='geo_tracker.plantrecord')),
            ],
            options={
                'verbose_name': 'Plant record photo',
                'verbose_name_plural': 'Plant record photos',
                'ordering': ['uploaded_at'],
            },
        ),
        # 2. Add nullable submission_id to PlantRecord
        migrations.AddField(
            model_name='plantrecord',
            name='submission_id',
            field=models.UUIDField(blank=True, db_index=True, editable=False, help_text='Unique submission UUID for idempotent creation and offline sync', null=True),
        ),
        # 3. Backfill UUIDs for all existing records
        migrations.RunPython(
            backfill_submission_ids,
            reverse_code=migrations.RunPython.noop,
        ),
        # 4. Alter submission_id to enforce uniqueness and default
        migrations.AlterField(
            model_name='plantrecord',
            name='submission_id',
            field=models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, help_text='Unique submission UUID for idempotent creation and offline sync', unique=True),
        ),
    ]

