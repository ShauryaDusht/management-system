from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='PlantVariety',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('plant_type', models.CharField(
                    choices=[('tree', 'Tree'), ('plant', 'Plant'), ('shrub', 'Shrub')],
                    max_length=10,
                )),
                ('scientific_name', models.CharField(blank=True, max_length=200)),
            ],
            options={'ordering': ['plant_type', 'name'], 'verbose_name_plural': 'Plant varieties'},
        ),
        migrations.CreateModel(
            name='PlantRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plant_type', models.CharField(
                    choices=[('tree', 'Tree'), ('plant', 'Plant'), ('shrub', 'Shrub')],
                    max_length=10,
                )),
                ('local_name', models.CharField(max_length=200)),
                ('scientific_name', models.CharField(blank=True, max_length=200)),
                ('variety', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='records',
                    to='geo_tracker.plantvariety',
                )),
                ('latitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('longitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('zone', models.CharField(blank=True, help_text='Zone name or code', max_length=100)),
                ('location_notes', models.CharField(blank=True, max_length=300)),
                ('height_m', models.DecimalField(
                    blank=True, decimal_places=2, help_text='Height in metres',
                    max_digits=6, null=True,
                )),
                ('girth_cm', models.DecimalField(
                    blank=True, decimal_places=2,
                    help_text='Girth/circumference at breast height in centimetres',
                    max_digits=7, null=True,
                )),
                ('canopy_spread_m', models.DecimalField(
                    blank=True, decimal_places=2, help_text='Canopy spread in metres',
                    max_digits=6, null=True,
                )),
                ('condition', models.CharField(
                    choices=[
                        ('excellent', 'Excellent'), ('good', 'Good'),
                        ('fair', 'Fair'), ('poor', 'Poor'), ('dead', 'Dead'),
                    ],
                    default='good', max_length=20,
                )),
                ('photo', models.ImageField(blank=True, null=True, upload_to='geo_tracker/photos/')),
                ('notes', models.TextField(blank=True)),
                ('submitted_by', models.CharField(help_text='Staff name or ID', max_length=200)),
                ('submitted_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={'ordering': ['-submitted_at']},
        ),
    ]
