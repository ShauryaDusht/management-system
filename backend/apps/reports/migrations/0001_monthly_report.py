from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='MonthlyReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.PositiveSmallIntegerField()),
                ('year', models.PositiveSmallIntegerField()),
                ('generated_at', models.DateTimeField(auto_now_add=True)),
                ('snapshot', models.JSONField(default=dict)),
                ('csv_file', models.FileField(blank=True, null=True, upload_to='reports/csv/')),
                ('pdf_file', models.FileField(blank=True, null=True, upload_to='reports/pdf/')),
                ('generated_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='monthly_reports_generated',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-year', '-month'],
                'unique_together': {('month', 'year')},
            },
        ),
    ]