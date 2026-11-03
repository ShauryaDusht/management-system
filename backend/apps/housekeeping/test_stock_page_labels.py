from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.housekeeping.models import HKArea, HKStockRequest, HKUserArea


class StockPageRequestLabelTests(TestCase):
    """An 'approved' request is only approved: the stock has not been issued, so it must not say 'Issued'."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(username='stock_label_caretaker', password='x', role='caretaker')
        self.area, _ = HKArea.objects.get_or_create(name='Ijokha', defaults={'area_type': 'hostel', 'is_active': True})
        HKUserArea.objects.get_or_create(user=self.user, area=self.area)
        self.client.force_login(self.user)

    def page(self):
        return self.client.get(f'/housekeeping/stock/?area={self.area.id}').content.decode()

    def request(self, status, item_name):
        return HKStockRequest.objects.create(
            requested_by=self.user, area=self.area, item_name=item_name, quantity=3, unit='Each',
            reason='stock', status=status)

    def test_approved_request_is_not_shown_as_issued(self):
        self.request('approved', 'Wiper (Small)')
        content = self.page()
        self.assertIn('Wiper (Small)', content)
        self.assertIn('Waiting for the manager to issue it', content)
        self.assertNotIn('Stock not issued yet', content)
        self.assertNotIn('>Issued<', content)

    def test_pending_request_still_says_stock_not_issued_yet(self):
        self.request('pending', 'Broom (Hard)')
        content = self.page()
        self.assertIn('Stock not issued yet', content)
        self.assertIn('Pending', content)
