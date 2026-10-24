import json
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from rest_framework.test import APIClient
from django.urls import reverse

from .models import (
    PlantVariety, PlantRecord, PlantType, CampusArea,
)


class CreeperStandardRecordTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin_user = User.objects.create_superuser(
            username='admin_test',
            email='admin@test.com',
            password='password123'
        )
        self.client.force_authenticate(user=self.admin_user)
        self.creeper_variety = PlantVariety.objects.create(
            name='Bougainvillea',
            plant_type=PlantType.CREEPER,
            scientific_name='Bougainvillea spectabilis',
        )

    def test_creeper_standard_submission(self):
        """Creepers are registered as standard single plant records with coordinates and condition."""
        payload = {
            'variety': self.creeper_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2120000',
            'longitude': '72.6850000',
            'condition': 'good',
            'notes': 'Standard single creeper record on wall',
        }
        res = self.client.post('/geo/submit/record/', data=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertNotIn('creeper', data)
        self.assertNotIn('creeper_info', data)

        record = PlantRecord.objects.get(tracking_id=data['id'])
        self.assertEqual(record.plant_type, 'creeper')
        self.assertEqual(record.latitude, Decimal('23.2120000'))
        self.assertEqual(record.longitude, Decimal('72.6850000'))
        self.assertEqual(record.condition, 'good')
        self.assertEqual(record.notes, 'Standard single creeper record on wall')

    def test_creeper_in_stats(self):
        """Stats include creepers and shrubs counts, with no block partitioning keys."""
        PlantRecord.objects.create(
            tracking_id='CACB99999',
            plant_type=PlantType.CREEPER,
            variety=self.creeper_variety,
            zone=CampusArea.ACADEMIC_BLOCK,
            latitude=Decimal('23.2120000'),
            longitude=Decimal('72.6850000'),
        )
        res = self.client.get('/api/geo-tracker/stats/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('creepers', data)
        self.assertIn('shrubs', data)
        self.assertGreaterEqual(data['creepers'], 1)
        self.assertNotIn('creeper_blocks', data)
        self.assertNotIn('shrub_blocks', data)


class PublicSubmitWorkflowTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.creeper_variety = PlantVariety.objects.create(
            name='Bougainvillea',
            plant_type=PlantType.CREEPER,
            scientific_name='Bougainvillea spectabilis',
        )
        self.tree_variety = PlantVariety.objects.create(
            name='Banyan',
            plant_type=PlantType.TREE,
            scientific_name='Ficus benghalensis',
        )
        self.shrub_variety = PlantVariety.objects.create(
            name='Tecoma',
            plant_type=PlantType.SHRUB,
            scientific_name='Tecoma stans',
        )

    def test_tree_workflow_unaffected(self):
        """Existing Tree workflow continues to function normally as standard single record."""
        payload = {
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2130000',
            'longitude': '72.6860000',
            'height_m': '8.5',
            'girth_cm': '120.0',
            'canopy_area_m': '6.0',
            'condition': 'excellent',
        }
        res = self.client.post('/geo/submit/record/', data=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertNotIn('creeper', data)
        self.assertNotIn('shrub', data)

        record = PlantRecord.objects.get(tracking_id=data['id'])
        self.assertEqual(record.plant_type, 'tree')
        self.assertEqual(record.height_m, Decimal('8.50'))

    def test_shrub_standard_submission(self):
        """Shrubs are registered as standard single plant records with coordinates and condition."""
        payload = {
            'variety': self.shrub_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2140000',
            'longitude': '72.6870000',
            'height_m': '2.5',
            'length_m': '3.0',
            'width_m': '2.0',
            'condition': 'good',
            'notes': 'Standard single shrub record',
        }
        res = self.client.post('/geo/submit/record/', data=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertNotIn('shrub', data)
        self.assertNotIn('shrub_info', data)

        record = PlantRecord.objects.get(tracking_id=data['id'])
        self.assertEqual(record.plant_type, 'shrub')
        self.assertTrue(record.tracking_id.startswith('SACB'))
        self.assertEqual(record.latitude, Decimal('23.2140000'))
        self.assertEqual(record.longitude, Decimal('72.6870000'))
        self.assertEqual(record.condition, 'good')
        self.assertEqual(record.height_m, Decimal('2.50'))
        self.assertEqual(record.length_m, Decimal('3.00'))
        self.assertEqual(record.width_m, Decimal('2.00'))
        self.assertEqual(record.notes, 'Standard single shrub record')
