from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('geo_tracker', '0010_expand_campus_areas_and_new_tracking_id'),
    ]

    operations = [
        migrations.CreateModel(
            name='CampusAreaConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('db_value', models.CharField(max_length=50, unique=True)),
                ('label', models.CharField(max_length=100)),
                ('code', models.CharField(max_length=3, unique=True)),
            ],
            options={
                'ordering': ['label'],
            },
        ),
    ]