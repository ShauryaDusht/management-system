import threading
import time
from unittest import mock, skipUnless

from django.db import connection
from django.test import TestCase, TransactionTestCase

from .housing_allotments_data import OFFICIAL_HOUSING_REGISTER
from .housing_master_data import MASTER_HOUSING_UNITS
from .models import HousingAllotment, HousingClearance, HousingUnit
from .views import INITIAL_CLEARANCES, ensure_initial_clearances, ensure_master_housing_inventory

OCCUPIED_FLATS = len([row for row in OFFICIAL_HOUSING_REGISTER if not row.get('is_vacant')])


def run_in_parallel(fn, workers=4):
    """Run fn() in several threads that start at the same moment (like gunicorn workers)."""
    barrier = threading.Barrier(workers)
    errors = []

    def target():
        try:
            barrier.wait()
            fn()
        except Exception as exc:  # pragma: no cover - reported through the assertion below
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=target) for _ in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return errors


class HousingSeedIdempotencyTests(TestCase):
    """Calling the first-run seeders again and again must never add rows."""

    def test_repeated_calls_create_each_row_once(self):
        for _ in range(3):
            ensure_master_housing_inventory()
            ensure_initial_clearances()

        self.assertEqual(HousingUnit.objects.count(), len(MASTER_HOUSING_UNITS))
        self.assertEqual(HousingAllotment.objects.count(), OCCUPIED_FLATS)
        self.assertEqual(HousingClearance.objects.count(), len(INITIAL_CLEARANCES))


@skipUnless(connection.vendor == 'postgresql', 'the row lock is PostgreSQL behaviour')
class HousingSeedConcurrencyTests(TransactionTestCase):
    """
    The admin page fires several API calls at once and gunicorn serves them in parallel, so the
    very first housing page load used to seed the allotments once per worker (every flat twice).
    """

    def test_parallel_first_loads_do_not_duplicate_allotments(self):
        # Units already exist, so every thread goes straight to the "no allotments yet?" check together.
        HousingUnit.objects.bulk_create([
            HousingUnit(
                house_type=row['house_type'].strip().upper(),
                house_no=row['house_no'].strip(),
                status=HousingUnit.Status.VACANT,
            )
            for row in MASTER_HOUSING_UNITS
        ])
        original_save = HousingAllotment.save

        def slow_save(instance, *args, **kwargs):
            # Widens the check-then-insert window so the race happens every time, not just sometimes.
            time.sleep(0.005)
            return original_save(instance, *args, **kwargs)

        with mock.patch.object(HousingAllotment, 'save', slow_save):
            errors = run_in_parallel(ensure_master_housing_inventory)

        self.assertEqual(errors, [])
        self.assertEqual(HousingUnit.objects.count(), len(MASTER_HOUSING_UNITS))
        self.assertEqual(HousingAllotment.objects.count(), OCCUPIED_FLATS)

    def test_parallel_first_loads_do_not_duplicate_clearances(self):
        ensure_master_housing_inventory()
        errors = run_in_parallel(ensure_initial_clearances)

        self.assertEqual(errors, [])
        self.assertEqual(HousingClearance.objects.count(), len(INITIAL_CLEARANCES))
