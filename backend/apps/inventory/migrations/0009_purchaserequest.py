from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('inventory', '0008_itemrequest_manager_approved_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='PurchaseRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('item_name', models.CharField(
                    help_text='Name of the item to be purchased (may not exist in stock yet)',
                    max_length=200,
                )),
                ('quantity_required', models.PositiveIntegerField(
                    validators=[django.core.validators.MinValueValidator(1)],
                )),
                ('unit', models.CharField(blank=True, max_length=20, help_text='Unit of measurement')),
                ('description', models.TextField(
                    blank=True,
                    help_text='Reason / additional context for the purchase request',
                )),
                ('priority', models.CharField(
                    choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('urgent', 'Urgent')],
                    default='medium',
                    max_length=10,
                )),
                ('estimated_cost', models.DecimalField(
                    blank=True,
                    decimal_places=2,
                    help_text='Estimated cost per unit (optional)',
                    max_digits=10,
                    null=True,
                )),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('approved', 'Approved'),
                        ('rejected', 'Rejected'),
                        ('completed', 'Completed'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('rejection_reason', models.TextField(blank=True)),
                ('admin_notes', models.TextField(blank=True, help_text='Notes added by admin on review')),
                ('requested_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('requested_by', models.ForeignKey(
                    limit_choices_to={'role__in': ['inventory_manager', 'admin']},
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='purchase_requests_made',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('reviewed_by', models.ForeignKey(
                    blank=True,
                    limit_choices_to={'role': 'admin'},
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='purchase_requests_reviewed',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-requested_at'],
            },
        ),
    ]
