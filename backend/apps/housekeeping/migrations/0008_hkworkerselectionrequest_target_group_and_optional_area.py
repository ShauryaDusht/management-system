from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0007_hkworkerselectionrequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='hkworkerselectionrequest',
            name='target_group',
            field=models.CharField(
                choices=[
                    ('all', 'All'),
                    ('hostels', 'Hostels'),
                    ('academic', 'Academic Blocks'),
                    ('others', 'Others'),
                ],
                default='all',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='hkworkerselectionrequest',
            name='target_area',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='worker_selection_target_requests',
                to='housekeeping.hkarea',
            ),
        ),
    ]
