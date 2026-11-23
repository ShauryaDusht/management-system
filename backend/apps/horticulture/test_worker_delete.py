import datetime

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from .models import HorticultureArea, HorticultureAttendanceRecord, HorticultureWorker, HorticultureWorkerArea, HorticultureZone


class AdminWorkerDeleteTests(APITestCase):
    """A worker can be deleted from the Workers screen, but never at the cost of their attendance history."""

    def setUp(self):
        self.admin = get_user_model().objects.create_user(username='horti_delete_admin', password='x', role='admin')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        zone = HorticultureZone.objects.create(name='Delete Zone', color_code='#16a34a')
        self.area = HorticultureArea.objects.create(zone=zone, area_number=1, name='Lawn')

    def delete(self, worker):
        return self.client.delete(f'/api/horticulture/admin/workers/{worker.id}/')

    def test_a_worker_with_no_history_is_deleted_together_with_their_area_assignments(self):
        worker = HorticultureWorker.objects.create(name='Fresh Worker', is_active=True)
        HorticultureWorkerArea.objects.create(worker=worker, area=self.area)

        self.assertEqual(self.delete(worker).status_code, 204)

        self.assertFalse(HorticultureWorker.objects.filter(pk=worker.pk).exists())
        self.assertFalse(HorticultureWorkerArea.objects.filter(area=self.area).exists())

    def test_a_worker_with_attendance_history_is_kept_and_the_user_is_told_why(self):
        worker = HorticultureWorker.objects.create(name='Old Worker', is_active=True)
        HorticultureAttendanceRecord.objects.create(
            worker=worker, date=datetime.date(2026, 10, 1), half='first', status='present', is_submitted=True)

        response = self.delete(worker)

        self.assertEqual(response.status_code, 409)
        self.assertIn('attendance or task history', response.data['detail'])
        self.assertTrue(HorticultureWorker.objects.filter(pk=worker.pk).exists())
        self.assertEqual(HorticultureAttendanceRecord.objects.filter(worker=worker).count(), 1)
