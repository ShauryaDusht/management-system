from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.reports.models import MonthlyPurchasePlan
from apps.reports.purchase_plan_utils import build_default_purchase_plan_data, merge_purchase_plan_data


DEFAULT_PERIODS = [
    (2, 2026),
    (3, 2026),
]


class Command(BaseCommand):
    help = "Ensure the default monthly purchase plans exist for the shared dataset."

    def add_arguments(self, parser):
        parser.add_argument("--quiet", action="store_true")

    def handle(self, *args, **options):
        quiet = options["quiet"]
        User = get_user_model()
        admin_user = (
            User.objects.filter(username="admin").first()
            or User.objects.filter(role="admin").order_by("id").first()
        )

        for month, year in DEFAULT_PERIODS:
            plan, created = MonthlyPurchasePlan.objects.get_or_create(
                month=month,
                year=year,
                defaults={
                    "data": build_default_purchase_plan_data(month, year),
                    "updated_by": admin_user,
                },
            )
            if created:
                if not quiet:
                    self.stdout.write(self.style.SUCCESS(f"Created purchase plan for {month:02d}/{year}"))
                continue

            merged = merge_purchase_plan_data(plan.data, month, year)
            if merged != (plan.data or {}):
                plan.data = merged
                if plan.updated_by_id is None and admin_user:
                    plan.updated_by = admin_user
                    plan.save(update_fields=["data", "updated_by", "updated_at"])
                else:
                    plan.save(update_fields=["data", "updated_at"])
                if not quiet:
                    self.stdout.write(self.style.SUCCESS(f"Updated purchase plan for {month:02d}/{year}"))
            elif not quiet:
                self.stdout.write(f"Purchase plan already current for {month:02d}/{year}")
