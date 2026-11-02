from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.housekeeping.models import HKArea, HKUserArea, HKWorker


class SupervisorAreaChangeTests(TestCase):
    """An admin moves a supervisor from one area to another (Manage Users -> areas)."""

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user('adm_sv', password='x', role='admin')
        self.sup = User.objects.create_user('sup_sv1', password='x', role='supervisor', first_name='Sup', last_name='One')
        self.other = User.objects.create_user('sup_sv2', password='x', role='supervisor', first_name='Other', last_name='Two')

        self.old_area, _ = HKArea.objects.get_or_create(
            name='Academic Block 1', defaults={'area_type': 'academic', 'is_active': True})
        self.new_area, _ = HKArea.objects.get_or_create(
            name='Sports Complex', defaults={'area_type': 'sports', 'is_active': True})
        HKUserArea.objects.get_or_create(user=self.sup, area=self.old_area)
        HKUserArea.objects.get_or_create(user=self.other, area=self.new_area)

        self.old_workers = [
            HKWorker.objects.create(name=f'Old block worker {i}', pay_code=f'91{i}', area=self.old_area,
                                    supervisor=self.sup, shift='day', is_active=True)
            for i in range(2)
        ]
        self.new_worker = HKWorker.objects.create(
            name='Sports worker', pay_code='950', area=self.new_area, supervisor=self.other,
            shift='day', is_active=True)

        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def move_supervisor_to(self, *areas):
        response = self.client.patch(
            f'/api/auth/users/{self.sup.id}/', {'area_ids': [a.id for a in areas]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def worker_rows(self):
        data = self.client.get('/api/housekeeping/workers/').data
        data = data if isinstance(data, list) else data.get('results', data)
        return {row['name']: row for row in data}

    def test_workers_of_the_area_the_supervisor_left_are_released(self):
        self.move_supervisor_to(self.new_area)

        for worker in self.old_workers:
            worker.refresh_from_db()
            self.assertIsNone(worker.supervisor_id, worker.name)
            # the dashboard shows the area's real supervisor (nobody now), not the one who moved away
            self.assertEqual(self.worker_rows()[worker.name]['supervisor_name'], '')
            self.assertEqual(self.worker_rows()[worker.name]['area_name'], 'Academic Block 1')

        # the workers of the area they moved to are theirs, and stay in that area
        self.new_worker.refresh_from_db()
        self.assertEqual(self.new_worker.supervisor_id, self.sup.id)
        self.assertEqual(self.new_worker.area_id, self.new_area.id)

        # their own overview counts only the workers of their current area
        supervisor_client = APIClient()
        supervisor_client.force_authenticate(self.sup)
        stats = supervisor_client.get('/api/housekeeping/profile/').data['worker_stats']
        self.assertEqual(stats['total'], 1)

    def test_workers_of_the_area_left_go_to_the_remaining_supervisor(self):
        HKUserArea.objects.create(user=self.other, area=self.old_area)

        self.move_supervisor_to(self.new_area)

        for worker in self.old_workers:
            worker.refresh_from_db()
            self.assertEqual(worker.supervisor_id, self.other.id, worker.name)

    def test_saving_the_same_areas_again_changes_nothing(self):
        self.move_supervisor_to(self.old_area)

        for worker in self.old_workers:
            worker.refresh_from_db()
            self.assertEqual(worker.supervisor_id, self.sup.id, worker.name)


class FixStaleWorkerSupervisorsCommandTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.moved = User.objects.create_user('moved_sv', password='x', role='supervisor')
        self.current = User.objects.create_user('current_sv', password='x', role='supervisor')
        self.area, _ = HKArea.objects.get_or_create(
            name='Academic Block 2', defaults={'area_type': 'academic', 'is_active': True})
        self.other_area, _ = HKArea.objects.get_or_create(
            name='Roads & Outdoor', defaults={'area_type': 'roads', 'is_active': True})
        HKUserArea.objects.get_or_create(user=self.moved, area=self.other_area)
        # left behind by an earlier move: the supervisor is no longer assigned to this worker's area
        self.stale = HKWorker.objects.create(
            name='Stale worker', pay_code='930', area=self.area, supervisor=self.moved, shift='day', is_active=True)
        self.fine = HKWorker.objects.create(
            name='Fine worker', pay_code='931', area=self.other_area, supervisor=self.moved, shift='day', is_active=True)

    def run_command(self, *args):
        out = StringIO()
        call_command('fix_stale_worker_supervisors', *args, stdout=out)
        return out.getvalue()

    def test_lists_without_changing_anything_by_default(self):
        output = self.run_command()

        self.assertIn('Stale worker', output)
        self.assertNotIn('Fine worker', output)
        self.stale.refresh_from_db()
        self.assertEqual(self.stale.supervisor_id, self.moved.id)

    def test_pool_relievers_are_not_treated_as_stale(self):
        pool, _ = HKArea.objects.get_or_create(
            name='Hostels Reliever', defaults={'area_type': 'hostel', 'is_active': True})
        reliever = HKWorker.objects.create(
            name='Pool reliever', pay_code='932', area=pool, supervisor=self.moved, shift='day',
            is_active=True, is_reliever=True, worker_type='reliever')

        self.assertNotIn('Pool reliever', self.run_command())
        self.run_command('--apply')

        reliever.refresh_from_db()
        self.assertEqual(reliever.supervisor_id, self.moved.id)

    def test_apply_clears_or_reassigns_only_the_stale_workers(self):
        self.run_command('--apply')

        self.stale.refresh_from_db()
        self.fine.refresh_from_db()
        self.assertIsNone(self.stale.supervisor_id)
        self.assertEqual(self.fine.supervisor_id, self.moved.id)
        self.assertIn('No workers with a stale supervisor', self.run_command())

    def test_apply_hands_the_worker_to_the_areas_current_supervisor(self):
        HKUserArea.objects.create(user=self.current, area=self.area)

        self.run_command('--apply')

        self.stale.refresh_from_db()
        self.assertEqual(self.stale.supervisor_id, self.current.id)
