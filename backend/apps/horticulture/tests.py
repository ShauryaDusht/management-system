import datetime

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import (
    HorticultureArea,
    HorticultureAttendanceRecord,
    HorticultureDailyAssignment,
    HorticultureWorker,
    HorticultureWorkerArea,
    HorticultureZone,
    TaskType,
)
from .serializers import AdminDailyAssignmentSerializer


class HorticultureAbsentAssignmentSerializerTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username='horti.manager',
            password='testpass',
            role='horticulture_manager',
        )
        self.zone = HorticultureZone.objects.create(name='Green Zone', color_code='#16a34a')
        self.area = HorticultureArea.objects.create(area_number=1, name='Area 1', zone=self.zone)
        self.worker = HorticultureWorker.objects.create(name='Horti Worker', is_active=True)
        HorticultureWorkerArea.objects.create(worker=self.worker, area=self.area, assigned_by=self.user)
        self.task_type = TaskType.objects.create(name='Watering', threshold_days_default=1, is_active=True)
        self.assignment_date = datetime.date(2026, 6, 3)

    def serializer(self, worker=None):
        return AdminDailyAssignmentSerializer(data={
            'worker': (worker or self.worker).id,
            'area': self.area.id,
            'date': self.assignment_date.isoformat(),
            'session': HorticultureDailyAssignment.Session.MORNING,
            'task_type': self.task_type.id,
            'status': HorticultureDailyAssignment.Status.PENDING,
        })

    def test_absent_worker_is_rejected_for_matching_session(self):
        HorticultureAttendanceRecord.objects.create(
            worker=self.worker,
            date=self.assignment_date,
            half=HorticultureAttendanceRecord.Half.FIRST,
            status=HorticultureAttendanceRecord.Status.ABSENT,
            marked_by=self.user,
            is_submitted=True,
        )

        serializer = self.serializer()

        self.assertFalse(serializer.is_valid())
        self.assertIn('worker', serializer.errors)

    def test_present_worker_is_assignable(self):
        HorticultureAttendanceRecord.objects.create(
            worker=self.worker,
            date=self.assignment_date,
            half=HorticultureAttendanceRecord.Half.FIRST,
            status=HorticultureAttendanceRecord.Status.PRESENT,
            marked_by=self.user,
            is_submitted=True,
        )

        serializer = self.serializer()

        self.assertTrue(serializer.is_valid(), serializer.errors)


@override_settings(ALLOWED_HOSTS=['testserver', 'localhost'])
class HorticultureMobilePortalActionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.supervisor = User.objects.create_user(
            username='horti.supervisor',
            password='testpass',
            role='supervisor',
        )
        self.zone = HorticultureZone.objects.create(
            name='Zone Red',
            color_code='#16a34a',
            supervisor=self.supervisor,
        )
        self.area = HorticultureArea.objects.create(area_number=2, name='Area 2', zone=self.zone)
        self.worker = HorticultureWorker.objects.create(name='Mobile Worker', is_active=True)
        HorticultureWorkerArea.objects.create(worker=self.worker, area=self.area, assigned_by=self.supervisor)
        self.task_type = TaskType.objects.create(name='Cleaning', threshold_days_default=1, is_active=True)
        self.client = Client(HTTP_USER_AGENT='test-mobile')
        self.client.force_login(self.supervisor)

    def test_mobile_assign_worker_returns_updated_horticulture_page(self):
        response = self.client.post(
            reverse('horticulture_mobile:horti-mark-task'),
            {
                'action': 'assign',
                'zone_id': self.zone.id,
                'area_id': self.area.id,
                'task_type_id': self.task_type.id,
                'session': HorticultureDailyAssignment.Session.MORNING,
                'worker_ids': [self.worker.id],
                'source': 'home',
            },
            secure=True,
            follow=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            HorticultureDailyAssignment.objects.filter(
                area=self.area,
                worker=self.worker,
                task_type=self.task_type,
                date=timezone.localdate(),
                status=HorticultureDailyAssignment.Status.PENDING,
            ).exists()
        )

    def test_mobile_attendance_mark_ajax_returns_worker_card(self):
        response = self.client.post(
            reverse('horticulture_mobile:horti-attendance'),
            {
                'action': 'mark',
                'zone': self.zone.id,
                'worker_id': self.worker.id,
                'half': HorticultureAttendanceRecord.Half.FIRST,
                'status': HorticultureAttendanceRecord.Status.PRESENT,
            },
            HTTP_HX_REQUEST='true',
            secure=True,
            follow=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            HorticultureAttendanceRecord.objects.filter(
                worker=self.worker,
                date=timezone.localdate(),
                half=HorticultureAttendanceRecord.Half.FIRST,
                status=HorticultureAttendanceRecord.Status.PRESENT,
            ).exists()
        )
