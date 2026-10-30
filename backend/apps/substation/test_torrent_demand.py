from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.substation.models import TorrentBill
from apps.users.models import User


class TorrentContractDemandSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.super_admin, _ = User.objects.get_or_create(
            username='test.demand.admin',
            defaults={
                'role': User.Role.ADMIN,
                'is_superuser': True,
                'is_staff': True,
            }
        )
        self.super_admin.role = User.Role.ADMIN
        self.super_admin.is_superuser = True
        self.super_admin.is_staff = True
        self.super_admin.save()

        self.plant_engineer, _ = User.objects.get_or_create(
            username='test.demand.plant',
            defaults={
                'role': User.Role.PLANT_ENGINEER,
            }
        )
        self.plant_engineer.role = User.Role.PLANT_ENGINEER
        self.plant_engineer.is_superuser = False
        self.plant_engineer.save()

        self.electrical_supervisor, _ = User.objects.get_or_create(
            username='test.demand.supervisor',
            defaults={
                'role': User.Role.ELECTRICAL_SUPERVISOR,
            }
        )
        self.electrical_supervisor.role = User.Role.ELECTRICAL_SUPERVISOR
        self.electrical_supervisor.is_superuser = False
        self.electrical_supervisor.save()

        # Clean any old test bills
        TorrentBill.objects.filter(month__in=['2026-08', '2026-09', '2026-10']).delete()

        # Base billing months
        self.bill_sep = TorrentBill.objects.create(
            month='2026-09',
            contract_demand_kw=3200.0,
            billing_demand_kw=2832.5,
            total_bill_amount=15048480.0,
        )
        self.bill_oct = TorrentBill.objects.create(
            month='2026-10',
            contract_demand_kw=3200.0,
            billing_demand_kw=2910.0,
            total_bill_amount=15200000.0,
        )

    def test_super_admin_can_update_contract_demand_via_patch(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.patch(
            '/api/substation/torrent/2026-09/',
            {
                'contractDemandKw': 3500.0,
                'remarks': 'Torrent Power sanctioned load expansion order #TP/2026/88',
                'applyFuture': False,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('contractDemandKw'), 3500.0)

        self.bill_sep.refresh_from_db()
        self.assertEqual(self.bill_sep.contract_demand_kw, 3500.0)
        self.assertIn('Super Admin', self.bill_sep.remarks)
        self.assertIn('3200 KW -> 3500 KW', self.bill_sep.remarks)

    def test_supervisor_cannot_update_contract_demand_via_patch(self):
        # Electrical supervisor attempt
        self.client.force_authenticate(user=self.electrical_supervisor)
        response = self.client.patch(
            '/api/substation/torrent/2026-09/',
            {'contractDemandKw': 4000.0},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Super Admin', response.data.get('error', ''))

        # Plant engineer attempt
        self.client.force_authenticate(user=self.plant_engineer)
        response2 = self.client.patch(
            '/api/substation/torrent/2026-09/',
            {'contractDemandKw': 4000.0},
            format='json',
        )
        self.assertEqual(response2.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Super Admin', response2.data.get('error', ''))

        # Verify database was NOT modified
        self.bill_sep.refresh_from_db()
        self.assertEqual(self.bill_sep.contract_demand_kw, 3200.0)

    def test_supervisor_blocked_from_changing_contract_demand_in_put(self):
        self.client.force_authenticate(user=self.electrical_supervisor)

        # Attempt to change contract demand from 3200 to 4500
        payload = {
            'month': '2026-09',
            'contractDemandKw': 4500.0,
            'billingDemandKw': 2850.0,
            'totalBillAmount': 15048480.0,
        }
        response = self.client.put('/api/substation/torrent/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Only Super Admin can modify Sanctioned Contract Demand', response.data.get('error', ''))

        # Normal PUT without changing contract demand succeeds for supervisor
        payload_ok = {
            'month': '2026-09',
            'contractDemandKw': 3200.0,
            'billingDemandKw': 2850.0,
            'totalBillAmount': 15100000.0,
        }
        response_ok = self.client.put('/api/substation/torrent/', payload_ok, format='json')
        self.assertEqual(response_ok.status_code, status.HTTP_200_OK)
        self.bill_sep.refresh_from_db()
        self.assertEqual(self.bill_sep.total_bill_amount, 15100000.0)
        self.assertEqual(self.bill_sep.contract_demand_kw, 3200.0)

    def test_apply_future_updates_all_subsequent_months_for_super_admin(self):
        # Create an earlier past bill
        bill_aug = TorrentBill.objects.create(
            month='2026-08',
            contract_demand_kw=3200.0,
            billing_demand_kw=2800.0,
            total_bill_amount=14800000.0,
        )

        self.client.force_authenticate(user=self.super_admin)
        # Update 2026-09 with applyFuture=True
        response = self.client.patch(
            '/api/substation/torrent/2026-09/',
            {
                'contractDemandKw': 3800.0,
                'remarks': 'Permanent campus load increment for Research Park Block B',
                'applyFuture': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('updatedCount'), 2)  # Sep and Oct

        bill_aug.refresh_from_db()
        self.bill_sep.refresh_from_db()
        self.bill_oct.refresh_from_db()

        # Prior month unchanged
        self.assertEqual(bill_aug.contract_demand_kw, 3200.0)
        # Target month updated
        self.assertEqual(self.bill_sep.contract_demand_kw, 3800.0)
        # Future month updated
        self.assertEqual(self.bill_oct.contract_demand_kw, 3800.0)
