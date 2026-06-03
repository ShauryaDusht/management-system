import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase

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
