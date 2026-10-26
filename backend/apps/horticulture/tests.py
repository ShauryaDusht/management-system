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

    def test_before_photo_timing_enforced(self):
        assignment = HorticultureDailyAssignment.objects.create(
            area=self.area,
            worker=self.worker,
            task_type=self.task_type,
            date=timezone.localdate(),
            session=HorticultureDailyAssignment.Session.MORNING,
            assigned_by=self.supervisor,
            status=HorticultureDailyAssignment.Status.PENDING,
        )
        from unittest.mock import patch
        import datetime
        from django.core.files.uploadedfile import SimpleUploadedFile

        dummy_img = SimpleUploadedFile('test.jpg', b'file_content', content_type='image/jpeg')

        # Test at 12:00 PM (outside 8:00 AM - 10:00 AM)
        mock_noon = datetime.datetime.combine(timezone.localdate(), datetime.time(12, 0))
        with patch('django.utils.timezone.localtime', return_value=mock_noon):
            response = self.client.post(
                reverse('horticulture_mobile:horti-mark-task'),
                {
                    'action': 'start',
                    'assignment_id': assignment.id,
                    'task_type_id': self.task_type.id,
                    'photo_before': dummy_img,
                },
                secure=True,
            )
            self.assertContains(response, 'बिफोर फोटो (Before Photo) केवल सुबह 8:00 AM से 10:00 AM के बीच ही ली जा सकती है।')

        # Test at 09:00 AM (inside 8:00 AM - 10:00 AM)
        mock_9am = datetime.datetime.combine(timezone.localdate(), datetime.time(9, 0))
        dummy_img2 = SimpleUploadedFile('test2.jpg', b'file_content', content_type='image/jpeg')
        with patch('django.utils.timezone.localtime', return_value=mock_9am):
            response = self.client.post(
                reverse('horticulture_mobile:horti-mark-task'),
                {
                    'action': 'start',
                    'assignment_id': assignment.id,
                    'task_type_id': self.task_type.id,
                    'photo_before': dummy_img2,
                },
                secure=True,
            )
            self.assertEqual(response.status_code, 302)
            assignment.refresh_from_db()
            self.assertEqual(assignment.status, HorticultureDailyAssignment.Status.IN_PROGRESS)

    def test_after_photo_timing_enforced(self):
        assignment = HorticultureDailyAssignment.objects.create(
            area=self.area,
            worker=self.worker,
            task_type=self.task_type,
            date=timezone.localdate(),
            session=HorticultureDailyAssignment.Session.MORNING,
            assigned_by=self.supervisor,
            status=HorticultureDailyAssignment.Status.IN_PROGRESS,
            started_at=timezone.now(),
        )
        from unittest.mock import patch
        import datetime
        from django.core.files.uploadedfile import SimpleUploadedFile

        dummy_img = SimpleUploadedFile('after.jpg', b'file_content', content_type='image/jpeg')

        # Test at 1:00 PM (outside 4:00 PM - 5:00 PM)
        mock_1pm = datetime.datetime.combine(timezone.localdate(), datetime.time(13, 0))
        with patch('django.utils.timezone.localtime', return_value=mock_1pm):
            response = self.client.post(
                reverse('horticulture_mobile:horti-mark-task'),
                {
                    'action': 'done',
                    'assignment_id': assignment.id,
                    'task_type_id': self.task_type.id,
                    'photo_after': dummy_img,
                },
                secure=True,
            )
            self.assertContains(response, 'आफ्टर फोटो (After Photo) केवल शाम 4:00 PM से 5:00 PM के बीच ही ली जा सकती है।')

        # Test at 4:30 PM (inside 4:00 PM - 5:00 PM)
        mock_430pm = datetime.datetime.combine(timezone.localdate(), datetime.time(16, 30))
        dummy_img2 = SimpleUploadedFile('after2.jpg', b'file_content', content_type='image/jpeg')
        with patch('django.utils.timezone.localtime', return_value=mock_430pm):
            response = self.client.post(
                reverse('horticulture_mobile:horti-mark-task'),
                {
                    'action': 'done',
                    'assignment_id': assignment.id,
                    'task_type_id': self.task_type.id,
                    'photo_after': dummy_img2,
                },
                secure=True,
            )
            self.assertEqual(response.status_code, 302)
            assignment.refresh_from_db()
            self.assertEqual(assignment.status, HorticultureDailyAssignment.Status.DONE)


@override_settings(ALLOWED_HOSTS=['testserver', 'localhost'])
class HorticultureStockInventorySyncTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.supervisor = User.objects.create_user(
            username='horti.sup.stock',
            password='testpass',
            role='supervisor',
        )
        self.zone = HorticultureZone.objects.create(
            name='Zone Red',
            color_code='#ef4444',
            supervisor=self.supervisor,
        )
        self.area1 = HorticultureArea.objects.create(area_number=101, name='Garden North', zone=self.zone)
        self.area2 = HorticultureArea.objects.create(area_number=102, name='Garden South', zone=self.zone)

        from apps.inventory.models import Category, Item
        from .models import HorticultureAreaStock
        self.Category = Category
        self.Item = Item
        self.HorticultureAreaStock = HorticultureAreaStock

        self.horti_cat = Category.objects.create(name='Garden & Horticulture Equipment')
        self.clean_cat = Category.objects.create(name='Cleaning Supplies')

        self.client = Client(HTTP_USER_AGENT='test-mobile')
        self.client.force_login(self.supervisor)

    def test_item_creation_syncs_to_all_horticulture_areas(self):
        item = self.Item.objects.create(
            name='Pruning Shears High Carbon',
            category=self.horti_cat,
            item_type='asset',
            unit='pieces',
            threshold_quantity=4,
        )
        stocks = self.HorticultureAreaStock.objects.filter(item=item)
        self.assertEqual(stocks.count(), 2)
        for stock in stocks:
            self.assertEqual(stock.item_name, 'Pruning Shears High Carbon')
            self.assertEqual(stock.quantity, 0)
            self.assertEqual(stock.low_stock_threshold, 4)

    def test_non_horticulture_item_not_synced(self):
        item = self.Item.objects.create(
            name='Floor Cleaner 5L',
            category=self.clean_cat,
            item_type='consumable',
            unit='litres',
            threshold_quantity=2,
        )
        stocks = self.HorticultureAreaStock.objects.filter(item=item)
        self.assertEqual(stocks.count(), 0)

    def test_item_update_syncs_name_unit_threshold(self):
        item = self.Item.objects.create(
            name='Grass Trimmer Line',
            category=self.horti_cat,
            item_type='consumable',
            unit='pieces',
            threshold_quantity=3,
        )
        item.name = 'Grass Trimmer Line Heavy Duty'
        item.unit = 'metres'
        item.threshold_quantity = 8
        item.save()

        stocks = self.HorticultureAreaStock.objects.filter(item=item)
        self.assertEqual(stocks.count(), 2)
        for stock in stocks:
            self.assertEqual(stock.item_name, 'Grass Trimmer Line Heavy Duty')
            self.assertEqual(stock.low_stock_threshold, 8)

    def test_category_change_deletes_and_recreates_stocks(self):
        item = self.Item.objects.create(
            name='Dual Purpose Tool',
            category=self.horti_cat,
            item_type='asset',
            unit='pieces',
        )
        self.assertEqual(self.HorticultureAreaStock.objects.filter(item=item).count(), 2)

        # Change away from horticulture
        item.category = self.clean_cat
        item.save()
        self.assertEqual(self.HorticultureAreaStock.objects.filter(item=item).count(), 0)

        # Change back to horticulture
        item.category = self.horti_cat
        item.save()
        self.assertEqual(self.HorticultureAreaStock.objects.filter(item=item).count(), 2)

    def test_item_deletion_removes_horticulture_area_stocks(self):
        item = self.Item.objects.create(
            name='Temporary Lawn Rake',
            category=self.horti_cat,
            item_type='asset',
            unit='pieces',
        )
        self.assertEqual(self.HorticultureAreaStock.objects.filter(item=item).count(), 2)

        item.delete()
        self.assertEqual(
            self.HorticultureAreaStock.objects.filter(item_name='Temporary Lawn Rake').count(),
            0
        )

    def test_new_area_creation_syncs_existing_horticulture_items(self):
        item = self.Item.objects.create(
            name='Hedge Trimmer Pro',
            category=self.horti_cat,
            item_type='asset',
            unit='pieces',
        )
        new_area = HorticultureArea.objects.create(area_number=103, name='Garden East', zone=self.zone)
        stock = self.HorticultureAreaStock.objects.filter(area=new_area, item=item).first()
        self.assertIsNotNone(stock)
        self.assertEqual(stock.item_name, 'Hedge Trimmer Pro')

    def test_stock_request_view_includes_all_horticulture_items(self):
        item = self.Item.objects.create(
            name='Petrol Brush Cutter 43cc',
            category=self.horti_cat,
            item_type='asset',
            unit='pieces',
            total_quantity=5,
            available_quantity=5,
        )
        response = self.client.get(
            reverse('horticulture_mobile:horti-stock-request'),
            {'zone': self.zone.id, 'area': self.area1.id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Petrol Brush Cutter 43cc')
