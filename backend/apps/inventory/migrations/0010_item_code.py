from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0009_purchaserequest_item_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='item',
            name='item_code',
            field=models.CharField(blank=True, db_index=True, max_length=20),
        ),
    ]
