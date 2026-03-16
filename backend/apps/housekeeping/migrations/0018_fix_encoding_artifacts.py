from django.db import migrations

def fix_encoding_artifacts(apps, schema_editor):
    HKScheduleTemplate = apps.get_model('housekeeping', 'HKScheduleTemplate')
    HKExtraWork = apps.get_model('housekeeping', 'HKExtraWork')
    
    replacements = [
        ('â€”', '-'),
        ('â”€', '-'),
        ('â€', '-'),
    ]

    # Fix HKScheduleTemplate tasks
    for t in HKScheduleTemplate.objects.all():
        original_name = t.task_name
        original_desc = t.task_description
        new_name = original_name
        new_desc = original_desc
        changed = False

        for bad, good in replacements:
            if bad in new_name:
                new_name = new_name.replace(bad, good)
                changed = True
            if bad in new_desc:
                new_desc = new_desc.replace(bad, good)
                changed = True

        if changed:
            t.task_name = new_name
            t.task_description = new_desc
            t.save(update_fields=['task_name', 'task_description'])

    # Fix HKExtraWork
    for e in HKExtraWork.objects.all():
        original_name = e.task_name
        original_desc = e.description
        new_name = original_name
        new_desc = original_desc
        changed = False
        
        for bad, good in replacements:
            if bad in new_name:
                new_name = new_name.replace(bad, good)
                changed = True
            if bad in new_desc:
                new_desc = new_desc.replace(bad, good)
                changed = True
                
        if changed:
            e.task_name = new_name
            e.description = new_desc
            e.save(update_fields=['task_name', 'description'])

def reverse_fix(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0017_update_staff_and_worker_data'),
    ]

    operations = [
        migrations.RunPython(fix_encoding_artifacts, reverse_fix),
    ]
