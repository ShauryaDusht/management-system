from django.conf import settings
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="HorticultureArea",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "area_number",
                    models.PositiveSmallIntegerField(
                        unique=True,
                        validators=[
                            django.core.validators.MinValueValidator(1),
                            django.core.validators.MaxValueValidator(42),
                        ],
                    ),
                ),
                ("name", models.CharField(max_length=200)),
            ],
            options={
                "ordering": ["area_number"],
            },
        ),
        migrations.CreateModel(
            name="HorticultureAttendance",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("date", models.DateField()),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                (
                    "supervisor",
                    models.ForeignKey(
                        limit_choices_to={"role": "supervisor"},
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="horticulture_attendance_submissions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "supervisor__username"],
            },
        ),
        migrations.CreateModel(
            name="HorticultureRoad",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("road_code", models.CharField(max_length=20)),
                ("name", models.CharField(max_length=200)),
                ("notes", models.TextField(blank=True)),
            ],
            options={
                "ordering": ["road_code", "name"],
            },
        ),
        migrations.CreateModel(
            name="HorticultureZone",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=100)),
                ("color_code", models.CharField(max_length=20)),
                ("notes", models.TextField(blank=True)),
                (
                    "supervisor",
                    models.ForeignKey(
                        blank=True,
                        limit_choices_to={"role": "supervisor"},
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="horticulture_supervised_zones",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="TaskType",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=100, unique=True)),
                (
                    "threshold_days_default",
                    models.PositiveIntegerField(
                        validators=[django.core.validators.MinValueValidator(1)]
                    ),
                ),
                (
                    "threshold_days_summer",
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        validators=[django.core.validators.MinValueValidator(1)],
                    ),
                ),
                (
                    "threshold_days_winter",
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        validators=[django.core.validators.MinValueValidator(1)],
                    ),
                ),
                (
                    "threshold_days_rainy",
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        validators=[django.core.validators.MinValueValidator(1)],
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="WorkerAttendance",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("present", "Present"),
                            ("absent", "Absent"),
                            ("half_day", "Half Day"),
                        ],
                        max_length=10,
                    ),
                ),
                (
                    "attendance",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="worker_attendances",
                        to="horticulture.horticultureattendance",
                    ),
                ),
                (
                    "worker",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="horticulture_worker_attendances",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["attendance__date", "worker__username"],
            },
        ),
        migrations.CreateModel(
            name="TaskLog",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("done_date", models.DateField()),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "area",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="task_logs",
                        to="horticulture.horticulturearea",
                    ),
                ),
                (
                    "done_by",
                    models.ForeignKey(
                        limit_choices_to={"role": "supervisor"},
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="horticulture_tasks_completed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "road",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="task_logs",
                        to="horticulture.horticultureroad",
                    ),
                ),
                (
                    "task_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="task_logs",
                        to="horticulture.tasktype",
                    ),
                ),
                (
                    "zone",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="task_logs",
                        to="horticulture.horticulturezone",
                    ),
                ),
            ],
            options={
                "ordering": ["-done_date", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="SeasonSetting",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "season",
                    models.CharField(
                        choices=[
                            ("summer", "Summer"),
                            ("winter", "Winter"),
                            ("rainy", "Rainy"),
                        ],
                        max_length=10,
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        limit_choices_to={
                            "role__in": ["admin", "horticulture_manager"]
                        },
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="horticulture_season_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Season setting",
                "verbose_name_plural": "Season setting",
            },
        ),
        migrations.AddField(
            model_name="horticultureroad",
            name="zone",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="roads",
                to="horticulture.horticulturezone",
            ),
        ),
        migrations.AddField(
            model_name="horticulturearea",
            name="zone",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="areas",
                to="horticulture.horticulturezone",
            ),
        ),
        migrations.AddConstraint(
            model_name="workerattendance",
            constraint=models.UniqueConstraint(
                fields=("attendance", "worker"),
                name="horticulture_worker_attendance_unique_entry",
            ),
        ),
        migrations.AddConstraint(
            model_name="tasklog",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("area__isnull", False), ("road__isnull", False), _negated=True
                ),
                name="horticulture_tasklog_area_and_road_not_both_set",
            ),
        ),
        migrations.AddConstraint(
            model_name="horticultureroad",
            constraint=models.UniqueConstraint(
                fields=("zone", "road_code"),
                name="horticulture_road_unique_code_per_zone",
            ),
        ),
        migrations.AddConstraint(
            model_name="horticultureattendance",
            constraint=models.UniqueConstraint(
                fields=("supervisor", "date"),
                name="horticulture_attendance_unique_supervisor_date",
            ),
        ),
    ]
