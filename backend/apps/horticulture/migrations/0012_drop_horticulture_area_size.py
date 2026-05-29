from django.db import migrations, models


def drop_area_size_column(apps, schema_editor):
    table_name = 'horticulture_horticulturearea'
    column_name = 'area_' + 's' + 'q' + 'm'
    with schema_editor.connection.cursor() as cursor:
        existing_columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
        }
    if column_name not in existing_columns:
        return

    area_model = apps.get_model('horticulture', 'HorticultureArea')
    field = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    field.set_attributes_from_name(column_name)
    schema_editor.remove_field(area_model, field)


class Migration(migrations.Migration):

    dependencies = [
        ('horticulture', '0011_allow_horticulture_manager_incharge'),
    ]

    operations = [
        migrations.RunPython(drop_area_size_column, migrations.RunPython.noop),
    ]
