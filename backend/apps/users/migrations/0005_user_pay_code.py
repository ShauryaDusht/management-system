from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_update_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='pay_code',
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
