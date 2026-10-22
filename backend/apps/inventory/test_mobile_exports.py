from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth import get_user_model
from apps.inventory.models import Category, Item

User = get_user_model()

class MobileExportReportTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='admin_test',
            password='password123',
            role='admin',
            first_name='Admin',
            last_name='User',
        )
        self.client.login(username='admin_test', password='password123')

        self.category = Category.objects.create(name='Cleaning Supplies')
        self.item = Item.objects.create(
            name='Microfiber Cloth',
            category=self.category,
            item_type='consumable',
            unit='pieces',
            total_quantity=100,
            available_quantity=80,
            threshold_quantity=20,
            unit_cost=25.0,
        )

    def test_export_inventory_report_csv(self):
        url = reverse('mobile_export_inventory_report_csv')
        response = self.client.get(url, {'format': 'csv'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('Microfiber Cloth', response.content.decode('utf-8'))

    def test_export_inventory_report_xlsx(self):
        url = reverse('mobile_export_inventory_report_csv')
        response = self.client.get(url, {'format': 'xlsx'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertTrue(len(response.content) > 0)

    def test_export_inventory_report_pdf(self):
        url = reverse('mobile_export_inventory_report_csv')
        response = self.client.get(url, {'format': 'pdf'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF'))

    def test_export_inventory_report_print(self):
        url = reverse('mobile_export_inventory_report_csv')
        response = self.client.get(url, {'format': 'print'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/html')
        self.assertIn('window.print()', response.content.decode('utf-8'))

    def test_export_requests_report_csv(self):
        url = reverse('mobile_export_requests_report_csv')
        response = self.client.get(url, {'format': 'csv'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')

    def test_export_requests_report_xlsx(self):
        url = reverse('mobile_export_requests_report_csv')
        response = self.client.get(url, {'format': 'xlsx'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    def test_export_requests_report_pdf(self):
        url = reverse('mobile_export_requests_report_csv')
        response = self.client.get(url, {'format': 'pdf'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF'))
