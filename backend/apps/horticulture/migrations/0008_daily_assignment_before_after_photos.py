from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('horticulture', '0007_horticulture_daily_assignment_status_flow'),
    ]

    operations = [
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='photo_before',
            field=models.ImageField(blank=True, null=True, upload_to='horticulture/tasks/%Y/%m/%d/before/'),
        ),
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='photo_before_uploaded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='photo_after',
            field=models.ImageField(blank=True, null=True, upload_to='horticulture/tasks/%Y/%m/%d/after/'),
        ),
        migrations.AddField(
            model_name='horticulturedailyassignment',
            name='photo_after_uploaded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
