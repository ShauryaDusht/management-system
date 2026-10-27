from django.db import migrations


def rename_zones(apps, schema_editor):
    HorticultureZone = apps.get_model('horticulture', 'HorticultureZone')

    # 1. Zone Red -> Academic+Director's residence+Guest House Area
    zone_red = (
        HorticultureZone.objects.filter(name='Zone Red').first()
        or HorticultureZone.objects.filter(color_code='red').first()
    )
    if zone_red:
        zone_red.name = "Academic+Director's residence+Guest House Area"
        zone_red.save(update_fields=['name'])

    # 2. Zone Blue -> Housing&Hostel
    zone_blue = (
        HorticultureZone.objects.filter(name='Zone Blue').first()
        or HorticultureZone.objects.filter(color_code='blue').first()
    )
    if zone_blue:
        zone_blue.name = 'Housing&Hostel'
        zone_blue.save(update_fields=['name'])

    # 3. Zone Black -> Research park
    zone_black = (
        HorticultureZone.objects.filter(name='Zone Black').first()
        or HorticultureZone.objects.filter(color_code='black').first()
    )
    if zone_black:
        zone_black.name = 'Research park'
        zone_black.save(update_fields=['name'])


def rollback_zones(apps, schema_editor):
    HorticultureZone = apps.get_model('horticulture', 'HorticultureZone')

    zone_red = (
        HorticultureZone.objects.filter(name="Academic+Director's residence+Guest House Area").first()
        or HorticultureZone.objects.filter(color_code='red').first()
    )
    if zone_red:
        zone_red.name = 'Zone Red'
        zone_red.save(update_fields=['name'])

    zone_blue = (
        HorticultureZone.objects.filter(name='Housing&Hostel').first()
        or HorticultureZone.objects.filter(color_code='blue').first()
    )
    if zone_blue:
        zone_blue.name = 'Zone Blue'
        zone_blue.save(update_fields=['name'])

    zone_black = (
        HorticultureZone.objects.filter(name='Research park').first()
        or HorticultureZone.objects.filter(color_code='black').first()
    )
    if zone_black:
        zone_black.name = 'Zone Black'
        zone_black.save(update_fields=['name'])


class Migration(migrations.Migration):

    dependencies = [
        ('horticulture', '0014_alter_horticulturearea_area_number'),
    ]

    operations = [
        migrations.RunPython(rename_zones, rollback_zones),
    ]
