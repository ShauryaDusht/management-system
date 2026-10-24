from django.db import migrations


def add_vankar_reliever(apps, schema_editor):
    HKWorker = apps.get_model('housekeeping', 'HKWorker')
    worker, created = HKWorker.objects.get_or_create(
        pay_code='494',
        defaults={
            'name': 'Vankar Vishalkumar Aravindbhai',
            'worker_type': 'reliever',
            'shift': 'day',
            'is_active': True,
            'is_reliever': True,
            'area': None,
            'supervisor': None,
        }
    )
    if not created:
        worker.name = 'Vankar Vishalkumar Aravindbhai'
        worker.worker_type = 'reliever'
        worker.is_reliever = True
        worker.is_active = True
        worker.area = None
        worker.supervisor = None
        worker.save()


def remove_vankar_reliever(apps, schema_editor):
    HKWorker = apps.get_model('housekeeping', 'HKWorker')
    HKWorker.objects.filter(pay_code='494', name='Vankar Vishalkumar Aravindbhai').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0027_hkstockrequest_covered_quantity'),
    ]

    operations = [
        migrations.RunPython(add_vankar_reliever, remove_vankar_reliever),
    ]
