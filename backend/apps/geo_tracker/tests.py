import io
import json
import uuid
from decimal import Decimal
from PIL import Image

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import TestCase, Client
from rest_framework.test import APIClient
from django.urls import reverse

from .models import (
    PlantVariety, PlantRecord, PlantRecordPhoto, PlantType, CampusArea,
)


def create_test_image(filename='test.jpg', size=(100, 100), color='green'):
    file_obj = io.BytesIO()
    image = Image.new('RGB', size, color=color)
    image.save(file_obj, 'JPEG')
    file_obj.seek(0)
    return SimpleUploadedFile(filename, file_obj.read(), content_type='image/jpeg')


class Stage1SyncEngineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin_user = User.objects.create_superuser(
            username='admin_sync',
            email='admin_sync@test.com',
            password='password123',
            role=User.Role.ADMIN,
        )
        self.horti_manager = User.objects.create_user(
            username='horti_mgr',
            email='horti_mgr@test.com',
            password='password123',
            role=User.Role.HORTICULTURE_MANAGER,
        )
        self.supervisor_user = User.objects.create_user(
            username='supervisor_sync',
            email='sup@test.com',
            password='password123',
            role=User.Role.SUPERVISOR,
        )
        self.unauthorized_user = User.objects.create_user(
            username='caretaker_sync',
            email='caretaker@test.com',
            password='password123',
            role=User.Role.CARETAKER,
        )

        self.tree_variety = PlantVariety.objects.create(
            name='Neem',
            plant_type=PlantType.TREE,
            scientific_name='Azadirachta indica',
        )
        self.creeper_variety = PlantVariety.objects.create(
            name='Bougainvillea',
            plant_type=PlantType.CREEPER,
            scientific_name='Bougainvillea spectabilis',
        )

    # 1. Creating a plant record via sync API
    def test_01_create_plant_record(self):
        self.client.force_authenticate(user=self.admin_user)
        sub_id = str(uuid.uuid4())
        payload = {
            'submission_id': sub_id,
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
            'height_m': '5.20',
            'girth_cm': '60.00',
            'canopy_area_m': '3.50',
            'condition': 'good',
            'notes': 'Offline-recorded tree test',
        }
        res = self.client.post('/api/geo-tracker/sync/records/', data=payload, format='json')
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertFalse(data['already_exists'])
        self.assertEqual(data['submission_id'], sub_id)

        record = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id))
        self.assertEqual(record.local_name, 'Neem')
        self.assertEqual(record.plant_type, 'tree')
        self.assertTrue(record.tracking_id.startswith('TACB'))
        self.assertEqual(record.height_m, Decimal('5.20'))

    # 2. Submitting the same submission_id twice (Idempotency)
    def test_02_submitting_same_submission_id_twice(self):
        self.client.force_authenticate(user=self.admin_user)
        sub_id = str(uuid.uuid4())
        payload = {
            'submission_id': sub_id,
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
            'height_m': '5.20',
            'condition': 'good',
        }
        res1 = self.client.post('/api/geo-tracker/sync/records/', data=payload, format='json')
        self.assertEqual(res1.status_code, 201)
        data1 = res1.json()

        # Retry identical submission
        res2 = self.client.post('/api/geo-tracker/sync/records/', data=payload, format='json')
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertTrue(data2['success'])
        self.assertTrue(data2['already_exists'])
        self.assertEqual(data2['record_id'], data1['record_id'])
        self.assertEqual(data2['tracking_id'], data1['tracking_id'])
        self.assertEqual(PlantRecord.objects.filter(submission_id=uuid.UUID(sub_id)).count(), 1)

    # 3. Concurrent duplicate submissions handling
    def test_03_concurrent_duplicate_submissions(self):
        self.client.force_authenticate(user=self.admin_user)
        sub_id = uuid.uuid4()
        # Pre-create record simulating race winner
        existing = PlantRecord.objects.create(
            submission_id=sub_id,
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem',
            zone=CampusArea.ACADEMIC_BLOCK,
            latitude=Decimal('23.2125000'),
            longitude=Decimal('72.6845000'),
        )
        payload = {
            'submission_id': str(sub_id),
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
        }
        res = self.client.post('/api/geo-tracker/sync/records/', data=payload, format='json')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['already_exists'])
        self.assertEqual(data['record_id'], existing.id)
        self.assertEqual(data['tracking_id'], existing.tracking_id)

    # 4. Uploading multiple photographs
    def test_04_uploading_multiple_photographs(self):
        self.client.force_authenticate(user=self.admin_user)
        sub_id = uuid.uuid4()
        record = PlantRecord.objects.create(
            submission_id=sub_id,
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem',
            zone=CampusArea.ACADEMIC_BLOCK,
            latitude=Decimal('23.2125000'),
            longitude=Decimal('72.6845000'),
        )

        photo1_id = str(uuid.uuid4())
        img1 = create_test_image('canopy.jpg', color='green')
        res1 = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': photo1_id, 'photo': img1},
            format='multipart',
        )
        self.assertEqual(res1.status_code, 201)
        data1 = res1.json()
        self.assertTrue(data1['success'])
        self.assertFalse(data1['already_exists'])

        # First photo integrates with record.photo for backward compatibility
        record.refresh_from_db()
        self.assertTrue(bool(record.photo))

        # Upload second photograph for the same record
        photo2_id = str(uuid.uuid4())
        img2 = create_test_image('trunk.jpg', color='brown')
        res2 = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': photo2_id, 'photo': img2},
            format='multipart',
        )
        self.assertEqual(res2.status_code, 201)
        data2 = res2.json()
        self.assertTrue(data2['success'])
        self.assertFalse(data2['already_exists'])

        self.assertEqual(record.photos.count(), 2)

    # 5. Retrying the same photo_id
    def test_05_retrying_same_photo_id(self):
        self.client.force_authenticate(user=self.admin_user)
        sub_id = uuid.uuid4()
        record = PlantRecord.objects.create(
            submission_id=sub_id,
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem',
            zone=CampusArea.ACADEMIC_BLOCK,
            latitude=Decimal('23.2125000'),
            longitude=Decimal('72.6845000'),
        )

        photo_id = str(uuid.uuid4())
        img = create_test_image('bark.jpg')
        res1 = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': photo_id, 'photo': img},
            format='multipart',
        )
        self.assertEqual(res1.status_code, 201)

        # Retry with the exact same photo_id
        img_retry = create_test_image('bark.jpg')
        res2 = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': photo_id, 'photo': img_retry},
            format='multipart',
        )
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertTrue(data2['success'])
        self.assertTrue(data2['already_exists'])
        self.assertEqual(data2['photo_id'], photo_id)
        self.assertEqual(PlantRecordPhoto.objects.filter(photo_id=uuid.UUID(photo_id)).count(), 1)

    # 6. Unauthenticated institutional network submission succeeds without login screen
    def test_06_unauthenticated_institutional_submission(self):
        sub_id = str(uuid.uuid4())
        payload = {
            'submission_id': sub_id,
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
            'height_m': '4.50',
            'condition': 'good',
        }
        res = self.client.post('/api/geo-tracker/sync/records/', data=payload, format='json')
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        record = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id))
        self.assertEqual(record.submitted_by, 'Geo tracker form')

    # 7. Campus area master validation & role-free submission
    def test_07_campus_area_validation_and_role_free_submission(self):
        # 7a. Non-existent campus area is rejected with 400 Bad Request
        sub_id_bad = str(uuid.uuid4())
        payload_bad = {
            'submission_id': sub_id_bad,
            'variety': self.tree_variety.id,
            'zone': 'non_existent_area_xyz',
            'latitude': '23.2125000',
            'longitude': '72.6845000',
        }
        res_bad = self.client.post('/api/geo-tracker/sync/records/', data=payload_bad, format='json')
        self.assertEqual(res_bad.status_code, 400)
        self.assertIn('Invalid campus area', res_bad.json()['error'])

        # 7b. Staff with non-horticulture role (e.g. housekeeping/caretaker) can submit for any valid area
        self.client.force_authenticate(user=self.unauthorized_user)
        sub_id_ok = str(uuid.uuid4())
        payload_ok = {
            'submission_id': sub_id_ok,
            'variety': self.tree_variety.id,
            'zone': CampusArea.CENTRAL_ARCADE,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
            'height_m': '3.80',
            'condition': 'good',
        }
        res_ok = self.client.post('/api/geo-tracker/sync/records/', data=payload_ok, format='json')
        self.assertEqual(res_ok.status_code, 201)
        record = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id_ok))
        self.assertEqual(record.zone, CampusArea.CENTRAL_ARCADE)
        self.assertEqual(record.submitted_by, self.unauthorized_user.get_full_name() or self.unauthorized_user.username)

    # 8. Invalid image upload
    def test_08_invalid_image_upload(self):
        self.client.force_authenticate(user=self.admin_user)
        sub_id = uuid.uuid4()
        record = PlantRecord.objects.create(
            submission_id=sub_id,
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem',
            zone=CampusArea.ACADEMIC_BLOCK,
            latitude=Decimal('23.2125000'),
            longitude=Decimal('72.6845000'),
        )

        invalid_file = SimpleUploadedFile('corrupt.jpg', b'not-an-image-content', content_type='image/jpeg')
        res = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': str(uuid.uuid4()), 'photo': invalid_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('invalid image file', res.json()['error'].lower())

    # 9. Existing record compatibility
    def test_09_existing_record_compatibility(self):
        # Create record without explicit submission_id (model generates one automatically)
        record = PlantRecord.objects.create(
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem',
            zone=CampusArea.CENTRAL_ARCADE,
            latitude=Decimal('23.2100000'),
            longitude=Decimal('72.6800000'),
        )
        self.assertIsNotNone(record.submission_id)
        self.assertTrue(record.tracking_id.startswith('TCAR'))

        # Fetch via admin detail endpoint
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f'/api/geo-tracker/records/{record.id}/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['tracking_id'], record.tracking_id)
        self.assertEqual(data['submission_id'], str(record.submission_id))
        self.assertIn('photos', data)

    # 10. Existing single-photo compatibility via public submit endpoint
    def test_10_existing_single_photo_compatibility(self):
        c = Client()
        img = create_test_image('field_photo.jpg')
        payload = {
            'variety': self.tree_variety.id,
            'zone': CampusArea.GROUND_SPORTS,
            'latitude': '23.2150000',
            'longitude': '72.6890000',
            'height_m': '4.00',
            'condition': 'good',
            'photo': img,
        }
        res = c.post('/geo/submit/record/', data=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])

        record = PlantRecord.objects.get(id=data['record_pk'])
        self.assertTrue(bool(record.photo))
        self.assertEqual(record.photos.count(), 1)
        self.assertTrue(record.tracking_id.startswith('TGRS'))

    # 11. Tracking ID generation sequential counter
    def test_11_tracking_id_generation(self):
        r1 = PlantRecord.objects.create(
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem 1',
            zone=CampusArea.HOSTELS,
            latitude=Decimal('23.2110000'),
            longitude=Decimal('72.6810000'),
        )
        r2 = PlantRecord.objects.create(
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem 2',
            zone=CampusArea.HOSTELS,
            latitude=Decimal('23.2110000'),
            longitude=Decimal('72.6810000'),
        )
        self.assertEqual(r1.tracking_id, 'THST00001')
        self.assertEqual(r2.tracking_id, 'THST00002')

    # 12. Sync status endpoint checks
    def test_12_sync_status_endpoint(self):
        # Unauthenticated request on institutional network returns 200 with can_sync: True
        res_unauth = self.client.get('/api/geo-tracker/sync/status/')
        self.assertEqual(res_unauth.status_code, 200)
        data_unauth = res_unauth.json()
        self.assertTrue(data_unauth['can_sync'])
        self.assertFalse(data_unauth['authenticated'])
        self.assertIsNone(data_unauth['user'])
        self.assertIn('*', data_unauth['allowed_areas'])

        # Authenticated check returns 200 with user profile and allowed areas
        self.client.force_authenticate(user=self.horti_manager)
        res_auth = self.client.get('/api/geo-tracker/sync/status/')
        self.assertEqual(res_auth.status_code, 200)
        data = res_auth.json()
        self.assertTrue(data['authenticated'])
        self.assertTrue(data['can_sync'])
        self.assertEqual(data['user']['username'], 'horti_mgr')
        self.assertEqual(data['user']['role'], 'horticulture_manager')
        self.assertIn('*', data['allowed_areas'])

    # 13. Optimistic concurrency control (409 Conflict on stale version)
    def test_13_optimistic_concurrency_conflict(self):
        self.client.force_authenticate(user=self.admin_user)
        record = PlantRecord.objects.create(
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Gulmohar Concurrent',
            zone=CampusArea.CENTRAL_ARCADE,
            latitude=Decimal('23.2100000'),
            longitude=Decimal('72.6800000'),
        )
        # Attempt PATCH with a stale expected_submitted_at
        stale_timestamp = "2020-01-01T00:00:00Z"
        res = self.client.patch(
            f'/api/geo-tracker/records/{record.id}/',
            data={'height_m': '9.50', 'expected_submitted_at': stale_timestamp},
            format='json'
        )
        self.assertEqual(res.status_code, 409)
        data = res.json()
        self.assertTrue(data['conflict'])
        self.assertIn('server_record', data)

        # Attempt PATCH with matching submitted_at succeeds
        matching_timestamp = record.submitted_at.isoformat()
        res_ok = self.client.patch(
            f'/api/geo-tracker/records/{record.id}/',
            data={'height_m': '9.50', 'expected_submitted_at': matching_timestamp},
            format='json'
        )
        self.assertEqual(res_ok.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.height_m, Decimal('9.50'))

        # Test explicit integer version OCC:
        # Initial version after update is now 2
        self.assertEqual(record.version, 2)
        # Attempt PATCH with stale version (version 1) returns 409 Conflict
        res_stale_v = self.client.patch(
            f'/api/geo-tracker/records/{record.id}/',
            data={'height_m': '11.00', 'expected_version': 1},
            format='json'
        )
        self.assertEqual(res_stale_v.status_code, 409)
        self.assertTrue(res_stale_v.json()['conflict'])

        # Attempt PATCH with correct version (version 2) succeeds and increments version to 3
        res_ok_v = self.client.patch(
            f'/api/geo-tracker/records/{record.id}/',
            data={'height_m': '11.00', 'expected_version': 2},
            format='json'
        )
        self.assertEqual(res_ok_v.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.height_m, Decimal('11.00'))
        self.assertEqual(record.version, 3)

    # 14. Area reassignment validation on backend
    def test_14_area_reassignment_validation(self):
        self.client.force_authenticate(user=self.admin_user)
        record = PlantRecord.objects.create(
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Tree Area Shift',
            zone=CampusArea.HOSTELS,
            latitude=Decimal('23.2100000'),
            longitude=Decimal('72.6800000'),
        )
        # Authorized admin reassigns zone to CENTRAL_ARCADE
        res = self.client.patch(
            f'/api/geo-tracker/records/{record.id}/',
            data={'zone': CampusArea.CENTRAL_ARCADE},
            format='json'
        )
        self.assertEqual(res.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.zone, CampusArea.CENTRAL_ARCADE)

    # 15. Unauthorized user cannot modify or delete record
    def test_15_unauthorized_record_access_blocked(self):
        record = PlantRecord.objects.create(
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Protected Tree',
            zone=CampusArea.HOSTELS,
            latitude=Decimal('23.2100000'),
            longitude=Decimal('72.6800000'),
        )
        # Caretaker user (unauthorized role)
        self.client.force_authenticate(user=self.unauthorized_user)
        res_get = self.client.get(f'/api/geo-tracker/records/{record.id}/')
        self.assertEqual(res_get.status_code, 403)

        res_patch = self.client.patch(
            f'/api/geo-tracker/records/{record.id}/',
            data={'notes': 'Tampering attempt'},
            format='json'
        )
        self.assertEqual(res_patch.status_code, 403)

        res_del = self.client.delete(f'/api/geo-tracker/records/{record.id}/')
        self.assertEqual(res_del.status_code, 403)

    # 16. Submitter audit attribution cannot be spoofed by callers
    def test_16_audit_attribution_spoofing_prevention(self):
        # 16a. Unauthenticated caller attempts to claim identity of VIP staff
        sub_id_spoof = str(uuid.uuid4())
        res_unauth = self.client.post('/api/geo-tracker/sync/records/', data={
            'submission_id': sub_id_spoof,
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
            'submitted_by': 'Professor Incharge Horticulture',  # Spoofed!
        }, format='json')
        self.assertEqual(res_unauth.status_code, 201)
        rec_unauth = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id_spoof))
        # Server must override spoofed value with strictly unverified default
        self.assertEqual(rec_unauth.submitted_by, 'Geo tracker form')

        # 16b. Authenticated caller attempts to spoof another user's name
        self.client.force_authenticate(user=self.unauthorized_user)
        sub_id_auth = str(uuid.uuid4())
        res_auth = self.client.post('/api/geo-tracker/sync/records/', data={
            'submission_id': sub_id_auth,
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
            'submitted_by': 'Admin Director',  # Spoofed!
        }, format='json')
        self.assertEqual(res_auth.status_code, 201)
        rec_auth = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id_auth))
        # Server must strictly enforce the authenticated user's actual name
        self.assertEqual(rec_auth.submitted_by, self.unauthorized_user.get_full_name() or self.unauthorized_user.username)

    # 17. Photo attachment to non-existent record is rejected
    def test_17_photo_attachment_to_nonexistent_record_rejected(self):
        img = create_test_image('orphan.jpg')
        res = self.client.post(
            f'/api/geo-tracker/sync/records/{uuid.uuid4()}/photos/',
            data={'photo_id': str(uuid.uuid4()), 'photo': img},
            format='multipart',
        )
        self.assertEqual(res.status_code, 404)

    # 18. Oversized photo (>20MB) is rejected with 413
    def test_18_oversized_photo_rejected(self):
        sub_id = uuid.uuid4()
        record = PlantRecord.objects.create(
            submission_id=sub_id,
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Neem',
            zone=CampusArea.ACADEMIC_BLOCK,
            latitude=Decimal('23.2125000'),
            longitude=Decimal('72.6845000'),
        )
        oversized_file = SimpleUploadedFile('big.jpg', b'X' * (21 * 1024 * 1024), content_type='image/jpeg')
        res = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': str(uuid.uuid4()), 'photo': oversized_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 413)

    # 19. Management endpoints strictly protect record listing & invalid area patch
    def test_19_management_endpoints_require_authorization(self):
        # Unauthenticated request to list records is blocked
        res_list_unauth = self.client.get('/api/geo-tracker/records/')
        self.assertIn(res_list_unauth.status_code, (401, 403))

        # Authenticated manager can access list
        self.client.force_authenticate(user=self.admin_user)
        res_list_auth = self.client.get('/api/geo-tracker/records/')
        self.assertEqual(res_list_auth.status_code, 200)

        # PATCH attempting to set invalid zone is rejected
        record = PlantRecord.objects.create(
            variety=self.tree_variety,
            plant_type=PlantType.TREE,
            local_name='Zone Patch Test',
            zone=CampusArea.HOSTELS,
            latitude=Decimal('23.2100000'),
            longitude=Decimal('72.6800000'),
        )
        res_patch_bad = self.client.patch(
            f'/api/geo-tracker/records/{record.id}/',
            data={'zone': 'bogus_zone_name'},
            format='json'
        )
        self.assertEqual(res_patch_bad.status_code, 400)

    # 20. End-to-end unauthenticated institutional sync flow
    def test_20_end_to_end_unauthenticated_sync_flow(self):
        # Step 1: Check status unauthenticated
        status_res = self.client.get('/api/geo-tracker/sync/status/')
        self.assertEqual(status_res.status_code, 200)
        self.assertTrue(status_res.data.get('can_sync'))
        self.assertFalse(status_res.data.get('authenticated'))

        # Step 2: Submit new plant record unauthenticated
        sub_id = str(uuid.uuid4())
        rec_res = self.client.post('/api/geo-tracker/sync/records/', data={
            'submission_id': sub_id,
            'variety': self.tree_variety.id,
            'local_name': 'Balamkhira',
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
            'height_m': '12.50',
            'condition': 'good'
        }, format='json')
        self.assertEqual(rec_res.status_code, 201)
        self.assertFalse(rec_res.data.get('already_exists'))
        tracking_id = rec_res.data.get('tracking_id')
        self.assertTrue(tracking_id.startswith('TACB'))

        # Step 3: Upload photo unauthenticated for the created record
        photo_id = str(uuid.uuid4())
        img = create_test_image('field_balamkhira.jpg')
        photo_res = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': photo_id, 'photo': img, 'original_filename': 'field_balamkhira.jpg'},
            format='multipart'
        )
        self.assertEqual(photo_res.status_code, 201)
        self.assertFalse(photo_res.data.get('already_exists'))

        # Step 4: Duplicate retry of metadata is idempotent (HTTP 200, already_exists: True)
        rec_retry = self.client.post('/api/geo-tracker/sync/records/', data={
            'submission_id': sub_id,
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2125000',
            'longitude': '72.6845000',
        }, format='json')
        self.assertEqual(rec_retry.status_code, 200)
        self.assertTrue(rec_retry.data.get('already_exists'))
        self.assertEqual(rec_retry.data.get('tracking_id'), tracking_id)

        # Step 5: Duplicate retry of photo is idempotent (HTTP 200, already_exists: True)
        img_retry = create_test_image('field_balamkhira.jpg')
        photo_retry = self.client.post(
            f'/api/geo-tracker/sync/records/{sub_id}/photos/',
            data={'photo_id': photo_id, 'photo': img_retry},
            format='multipart'
        )
        self.assertEqual(photo_retry.status_code, 200)
        self.assertTrue(photo_retry.data.get('already_exists'))

        # Step 6: Verify attribution and linkage in database
        saved_rec = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id))
        self.assertEqual(saved_rec.submitted_by, 'Geo tracker form')
        self.assertEqual(saved_rec.photos.count(), 1)
        self.assertEqual(saved_rec.photos.first().photo_id, uuid.UUID(photo_id))

    # 21. Submissions across diverse configured campus areas without auth or supervisor restrictions
    def test_21_unauthenticated_role_free_submission_all_configured_campus_areas(self):
        test_zones = [
            CampusArea.HOUSING_ZONE,
            CampusArea.HOSTELS,
            CampusArea.DIRECTOR_RESIDENCE,
            CampusArea.MIYA_BAUG,
            CampusArea.SOLAR_CAR_PARKING,
            CampusArea.WATER_TREATMENT,
        ]
        created_tracking_ids = []

        for zone in test_zones:
            sub_id = str(uuid.uuid4())
            res = self.client.post('/api/geo-tracker/sync/records/', data={
                'submission_id': sub_id,
                'variety': self.tree_variety.id,
                'local_name': f'Tree in {zone}',
                'zone': zone,
                'latitude': '23.2120000',
                'longitude': '72.6840000',
                'height_m': '6.00',
                'condition': 'good'
            }, format='json')
            self.assertEqual(res.status_code, 201, f"Failed for campus area {zone}: {res.data}")
            tracking_id = res.data.get('tracking_id')
            self.assertIsNotNone(tracking_id)
            created_tracking_ids.append(tracking_id)

            # Record must exist in DB with correct area and safe unauthenticated attribution
            rec = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id))
            self.assertEqual(rec.zone, zone)
            self.assertEqual(rec.submitted_by, 'Geo tracker form')

        self.assertEqual(len(set(created_tracking_ids)), len(test_zones), "Each area must produce a unique tracking ID")

    # 22. Safe attribution prevents client from spoofing submitted_by
    def test_22_safe_attribution_without_client_spoofing(self):
        sub_id = str(uuid.uuid4())
        # Client attempts to pass a spoofed submitted_by
        res = self.client.post('/api/geo-tracker/sync/records/', data={
            'submission_id': sub_id,
            'variety': self.tree_variety.id,
            'local_name': 'Attribution Test Tree',
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2121000',
            'longitude': '72.6841000',
            'submitted_by': 'Super Administrator Infiltrator',
        }, format='json')
        self.assertEqual(res.status_code, 201)

        rec = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id))
        # Spoofed value must be overridden with standard unauthenticated attribution
        self.assertEqual(rec.submitted_by, 'Geo tracker form')

        # Also verify for the form submission endpoint /geo/submit/record/
        sub_id_form = str(uuid.uuid4())
        res_form = self.client.post('/geo/submit/record/', data={
            'submission_id': sub_id_form,
            'variety': self.tree_variety.id,
            'zone': CampusArea.ACADEMIC_BLOCK,
            'latitude': '23.2122000',
            'longitude': '72.6842000',
            'submitted_by': 'Malicious Form Submitter',
        })
        self.assertEqual(res_form.status_code, 201)
        rec_form = PlantRecord.objects.get(submission_id=uuid.UUID(sub_id_form))
        self.assertEqual(rec_form.submitted_by, 'Geo tracker form')

    # 23. Sync status endpoint permits sync without user session
    def test_23_sync_status_unauthenticated_can_sync_true(self):
        res = self.client.get('/api/geo-tracker/sync/status/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get('can_sync'))
        self.assertTrue(res.data.get('network_available'))
        self.assertFalse(res.data.get('authenticated'))
        self.assertIsNone(res.data.get('user'))
        self.assertEqual(res.data.get('allowed_areas'), ['*'])

    # 24. Management, editing, deletion and export APIs remain strictly protected
    def test_24_management_apis_remain_protected(self):
        # Unauthenticated calls to management APIs must fail
        endpoints = [
            ('/api/geo-tracker/records/', 'GET'),
            ('/api/geo-tracker/records/export/', 'GET'),
            ('/api/geo-tracker/varieties/', 'GET'),
            ('/api/geo-tracker/varieties/', 'POST'),
            ('/api/geo-tracker/areas/', 'GET'),
            ('/api/geo-tracker/areas/', 'POST'),
            ('/api/geo-tracker/stats/', 'GET'),
        ]
        for url, method in endpoints:
            if method == 'GET':
                res = self.client.get(url)
            else:
                res = self.client.post(url, data={})
            self.assertIn(res.status_code, (401, 403), f"Endpoint {url} ({method}) should be protected but returned {res.status_code}")


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

        record = PlantRecord.objects.get(tracking_id=data['id'])
        self.assertEqual(record.plant_type, 'creeper')
        self.assertEqual(record.latitude, Decimal('23.2120000'))
        self.assertEqual(record.longitude, Decimal('72.6850000'))
        self.assertEqual(record.condition, 'good')

    def test_creeper_in_stats(self):
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

        record = PlantRecord.objects.get(tracking_id=data['id'])
        self.assertEqual(record.plant_type, 'tree')
        self.assertEqual(record.height_m, Decimal('8.50'))

    def test_shrub_standard_submission(self):
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

        record = PlantRecord.objects.get(tracking_id=data['id'])
        self.assertEqual(record.plant_type, 'shrub')
        self.assertTrue(record.tracking_id.startswith('SACB'))
        self.assertEqual(record.latitude, Decimal('23.2140000'))
        self.assertEqual(record.longitude, Decimal('72.6870000'))
        self.assertEqual(record.condition, 'good')
