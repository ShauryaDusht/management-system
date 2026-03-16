from django.db import migrations

def fix_encoding_artifacts(apps, schema_editor):
    HKScheduleTemplate = apps.get_model('housekeeping', 'HKScheduleTemplate')
    HKExtraWork = apps.get_model('housekeeping', 'HKExtraWork')
    Item = apps.get_model('inventory', 'Item')
    Category = apps.get_model('inventory', 'Category')
    
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

    # Fix Inventory Items
    for i in Item.objects.all():
        original_name = i.name
        original_desc = i.description
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
            i.name = new_name
            i.description = new_desc
            i.save(update_fields=['name', 'description'])

    # Fix Inventory Categories
    for c in Category.objects.all():
        original_name = c.name
        original_desc = c.description
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
            c.name = new_name
            c.description = new_desc
            c.save(update_fields=['name', 'description'])

def reverse_fix(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('housekeeping', '0017_update_staff_and_worker_data'),
        ('inventory', '0001_initial'), # Adding inventory dependency
    ]

    operations = [
        migrations.RunPython(fix_encoding_artifacts, reverse_fix),
    ]
