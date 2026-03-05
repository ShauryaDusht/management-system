from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0005_alter_itemissue_issued_quantity_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='InventoryTask',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('priority', models.CharField(
                    choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')],
                    default='medium',
                    max_length=10,
                )),
                ('status', models.CharField(
                    choices=[('open', 'Open'), ('in_progress', 'In Progress'), ('done', 'Done')],
                    default='open',
                    max_length=20,
                )),
                ('deadline', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_to', models.ForeignKey(
                    blank=True,
                    limit_choices_to={'role': 'inventory_manager'},
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='inventory_tasks',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='inventory_tasks_created',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
