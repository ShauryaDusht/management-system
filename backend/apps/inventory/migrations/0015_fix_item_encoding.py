from django.db import migrations

def fix_item_encoding(apps, schema_editor):
    Item = apps.get_model('inventory', 'Item')
    Category = apps.get_model('inventory', 'Category')
    
    replacements = [
        ('â€”', '-'),
        ('â”€', '-'),
        ('â€', '-'),
        ('—', '-'),
    ]

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
        ('inventory', '0014_item_item_code'),
    ]

    operations = [
        migrations.RunPython(fix_item_encoding, reverse_fix),
    ]
