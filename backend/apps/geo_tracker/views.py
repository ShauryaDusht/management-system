import json
import logging
import uuid
from decimal import Decimal
from django.http import HttpResponse, JsonResponse
from django.db import IntegrityError, transaction
from django.db.models import F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.utils.decorators import method_decorator

from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminOrHKInventoryOrHorticultureManager, IsAdminOrManagerOrSupervisor

from .models import (
    CampusArea, PlantRecord, PlantRecordPhoto, PlantVariety, CampusAreaConfig,
)
from .serializers import (
    PlantRecordSerializer,
    PlantRecordPhotoSerializer,
    PlantRecordCreateSerializer,
    PlantRecordSyncSerializer,
    PlantRecordUpdateSerializer,
    PlantVarietySerializer,
    campus_area_choices,
    records_to_csv,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Authorization and Area Validation Helpers
# ---------------------------------------------------------------------------

def is_user_authorized_for_zone(user, zone_name):
    """
    Validate whether the authenticated user has permission to submit
    or modify plant records in the given campus zone/area.
    - Admin, Horticulture Manager, HK/Inventory Manager: authorized for all areas.
    - Supervisor: authorized if assigned to horticulture zones or active incharge duties.
    - Non-horticulture roles: forbidden.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False):
        return True
    if getattr(user, 'is_horticulture_manager', False) or getattr(user, 'is_hk_inventory_manager', False):
        return True
    if getattr(user, 'is_supervisor', False):
        has_horti_zone = hasattr(user, 'horticulture_supervised_zones') and user.horticulture_supervised_zones.exists()
        from apps.horticulture.models import HorticultureInchargeAssignment
        has_incharge = HorticultureInchargeAssignment.objects.filter(
            assigned_staff=user,
            leave_date__gte=timezone.localdate()
        ).exists()
        if has_horti_zone or has_incharge:
            return True
    return False


def get_user_allowed_areas(user):
    """Return list of allowed campus area values for the given user, or ['*'] for all."""
    if not user or not user.is_authenticated or not user.is_active:
        return []
    if getattr(user, 'is_admin', False) or getattr(user, 'is_superuser', False) or \
       getattr(user, 'is_horticulture_manager', False) or getattr(user, 'is_hk_inventory_manager', False):
        return ['*']
    if getattr(user, 'is_supervisor', False):
        has_horti_zone = hasattr(user, 'horticulture_supervised_zones') and user.horticulture_supervised_zones.exists()
        from apps.horticulture.models import HorticultureInchargeAssignment
        has_incharge = HorticultureInchargeAssignment.objects.filter(
            assigned_staff=user,
            leave_date__gte=timezone.localdate()
        ).exists()
        if has_horti_zone or has_incharge:
            return ['*']
    return []


# ---------------------------------------------------------------------------
# Public submit form (no auth required)
# ---------------------------------------------------------------------------

def geo_submit_form(request):
    """Render the mobile-friendly data-collection form."""
    varieties = PlantVariety.objects.all().order_by('plant_type', 'name')
    return render(request, 'geo_tracker/submit_form.html', {
        'varieties': varieties,
        'campus_areas': campus_area_choices(),
    })


@csrf_exempt
def geo_submit_record(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    data = request.POST.dict()
    # Remove empty strings so optional fields don't fail validation
    data = {k: v for k, v in data.items() if v != ''}

    # Idempotency check if submission_id supplied
    raw_sub_id = data.get('submission_id')
    sub_uuid = None
    if raw_sub_id:
        try:
            sub_uuid = uuid.UUID(str(raw_sub_id))
            existing = PlantRecord.objects.filter(submission_id=sub_uuid).first()
            if existing:
                return JsonResponse({
                    'success': True,
                    'already_exists': True,
                    'id': existing.tracking_id,
                    'record_pk': existing.id,
                    'submission_id': str(existing.submission_id),
                    'message': 'Record already submitted.',
                }, status=200)
        except (ValueError, TypeError):
            sub_uuid = None

    serializer = PlantRecordCreateSerializer(data=data)
    if not serializer.is_valid():
        return JsonResponse({'errors': serializer.errors}, status=400)

    # Attribution handling: safely set submitted_by without trusting client
    if request.user and request.user.is_authenticated:
        submitted_by = request.user.get_full_name() or request.user.username
    else:
        submitted_by = 'Geo tracker form'

    save_kwargs = {'submitted_by': submitted_by}
    if sub_uuid:
        save_kwargs['submission_id'] = sub_uuid

    record = serializer.save(**save_kwargs)

    if 'photo' in request.FILES:
        photo_file = request.FILES['photo']
        record.photo = photo_file
        record.save(update_fields=['photo'])

        # Also register in PlantRecordPhoto
        raw_photo_id = data.get('photo_id')
        p_uuid = uuid.uuid4()
        if raw_photo_id:
            try:
                p_uuid = uuid.UUID(str(raw_photo_id))
            except (ValueError, TypeError):
                pass
        PlantRecordPhoto.objects.get_or_create(
            photo_id=p_uuid,
            defaults={
                'record': record,
                'photo': photo_file,
                'original_filename': photo_file.name,
                'file_size': getattr(photo_file, 'size', None),
                'mime_type': getattr(photo_file, 'content_type', ''),
            }
        )

    return JsonResponse({
        'success': True,
        'id': record.tracking_id,
        'record_pk': record.id,
        'submission_id': str(record.submission_id),
        'message': 'Record submitted successfully.',
    }, status=201)


# ---------------------------------------------------------------------------
# Offline-First Synchronization API Endpoints
# ---------------------------------------------------------------------------

class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Bypasses CSRF checking for institutional network mobile sync requests."""
    def enforce_csrf(self, request):
        return


class GeoTrackerSyncStatusView(APIView):
    """
    GET /api/geo-tracker/sync/status/
    Institutional network connectivity and synchronization status check.
    - Accessible from IITGN institutional network.
    - Returns 200 with can_sync: True whenever reached over institutional network.
    - Captures authenticated user profile if an active session exists.
    """
    permission_classes = [AllowAny]
    authentication_classes = [CsrfExemptSessionAuthentication]

    def get(self, request):
        is_authenticated = bool(request.user and request.user.is_authenticated and request.user.is_active)
        user_info = None
        if is_authenticated:
            user_info = {
                'id': request.user.id,
                'username': request.user.username,
                'name': request.user.get_full_name() or request.user.username,
                'role': getattr(request.user, 'role', ''),
            }

        return Response({
            'authenticated': is_authenticated,
            'can_sync': True,
            'network_available': True,
            'user': user_info,
            'allowed_areas': ['*'],
            'server_time': timezone.now().isoformat(),
            'message': 'Connected to IITGN Institutional Network',
        }, status=status.HTTP_200_OK)


class GeoTrackerSyncRecordsView(APIView):
    """
    POST /api/geo-tracker/sync/records/
    Idempotent synchronization endpoint for plant records.
    - Preserves original institutional network submission model (no login screen required).
    - Validates campus area against configured campus-area master.
    - Idempotent via submission_id: if submission_id exists, returns existing server record.
    - Uses database transactions and handles concurrent duplicates gracefully.
    - Preserves audit information (staff name if logged in, else submission source).
    """
    permission_classes = [AllowAny]
    authentication_classes = [CsrfExemptSessionAuthentication]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

        # 1. Validate submission_id
        raw_submission_id = data.get('submission_id')
        if not raw_submission_id:
            return Response({
                'error': 'submission_id (UUID) is required for synchronization.'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            submission_uuid = uuid.UUID(str(raw_submission_id))
        except (ValueError, TypeError):
            return Response({
                'error': 'Invalid submission_id format. Must be a valid UUID.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 2. Idempotency Check: if record already exists, return it immediately
        existing = PlantRecord.objects.filter(submission_id=submission_uuid).select_related('variety').first()
        if existing:
            return Response({
                'success': True,
                'already_exists': True,
                'record_id': existing.id,
                'tracking_id': existing.tracking_id,
                'submission_id': str(existing.submission_id),
                'message': 'Record already synchronized.',
            }, status=status.HTTP_200_OK)

        # 3. Campus Area Validation: ensure zone exists in configured campus-area master
        zone = data.get('zone', '')
        valid_areas = {v for v, _ in campus_area_choices()}
        if not zone or zone not in valid_areas:
            return Response({
                'error': f"Invalid campus area '{zone}'. Must be a configured campus area."
            }, status=status.HTTP_400_BAD_REQUEST)

        # 4. Audit Information: enforce unforgeable attribution
        if request.user and request.user.is_authenticated:
            data['submitted_by'] = request.user.get_full_name() or request.user.username
        else:
            data['submitted_by'] = 'Geo tracker form'

        # 5. Validate & Save using transaction.atomic()
        serializer = PlantRecordSyncSerializer(data=data)
        if not serializer.is_valid():
            return Response({'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                record = serializer.save()
        except IntegrityError as e:
            # Race condition: concurrent duplicate submission_id
            existing = PlantRecord.objects.filter(submission_id=submission_uuid).first()
            if existing:
                return Response({
                    'success': True,
                    'already_exists': True,
                    'record_id': existing.id,
                    'tracking_id': existing.tracking_id,
                    'submission_id': str(existing.submission_id),
                    'message': 'Record already synchronized.',
                }, status=status.HTTP_200_OK)
            raise e

        # Optional single-request photo upload handling
        if 'photo' in request.FILES:
            photo_file = request.FILES['photo']
            record.photo = photo_file
            record.save(update_fields=['photo'])

            raw_photo_id = data.get('photo_id')
            p_uuid = uuid.uuid4()
            if raw_photo_id:
                try:
                    p_uuid = uuid.UUID(str(raw_photo_id))
                except (ValueError, TypeError):
                    pass
            plant_photo, _ = PlantRecordPhoto.objects.get_or_create(
                photo_id=p_uuid,
                defaults={
                    'record': record,
                    'photo': photo_file,
                    'original_filename': photo_file.name,
                    'file_size': getattr(photo_file, 'size', None),
                    'mime_type': getattr(photo_file, 'content_type', ''),
                }
            )
            if not record.photo and plant_photo.photo:
                record.photo = plant_photo.photo
                record.save(update_fields=['photo'])

        return Response({
            'success': True,
            'already_exists': False,
            'record_id': record.id,
            'tracking_id': record.tracking_id,
            'submission_id': str(record.submission_id),
            'message': 'Plant record created successfully.',
        }, status=status.HTTP_201_CREATED)


class GeoTrackerSyncPhotosView(APIView):
    """
    POST /api/geo-tracker/sync/records/{submission_id}/photos/
    Idempotent photograph upload endpoint for an existing plant record.
    - Preserves institutional network access model.
    - Accepts photo_id (UUID) and image file.
    - Validates associated record.
    - Avoids duplicate attachments.
    - Returns existing photo info if photo_id is retried.
    """
    permission_classes = [AllowAny]
    authentication_classes = [CsrfExemptSessionAuthentication]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, submission_id):
        # 1. Find the record by its submission UUID. Never by the integer pk: this endpoint is
        # unauthenticated, and sequential pks would let anyone attach photos to other people's records.
        record = None
        try:
            sub_uuid = uuid.UUID(str(submission_id))
            record = PlantRecord.objects.filter(submission_id=sub_uuid).first()
        except (ValueError, TypeError):
            record = None

        if not record:
            return Response({
                'error': f"Plant record with submission ID '{submission_id}' was not found."
            }, status=status.HTTP_404_NOT_FOUND)

        # 2. Validate photo_id
        raw_photo_id = request.data.get('photo_id')
        if not raw_photo_id:
            return Response({
                'error': 'photo_id (UUID) is required for idempotent photograph upload.'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            photo_uuid = uuid.UUID(str(raw_photo_id))
        except (ValueError, TypeError):
            return Response({
                'error': 'Invalid photo_id format. Must be a valid UUID.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 4. Idempotency Check: if photo already uploaded, return existing info
        existing_photo = PlantRecordPhoto.objects.filter(photo_id=photo_uuid).first()
        if existing_photo:
            photo_url = request.build_absolute_uri(existing_photo.photo.url) if existing_photo.photo else None
            return Response({
                'success': True,
                'already_exists': True,
                'photo_id': str(existing_photo.photo_id),
                'record_id': existing_photo.record.id,
                'tracking_id': existing_photo.record.tracking_id,
                'photo_url': photo_url,
                'message': 'Photograph already uploaded.',
            }, status=status.HTTP_200_OK)

        # 5. Extract and validate image file
        photo_file = request.FILES.get('photo') or request.FILES.get('file') or request.FILES.get('image')
        if not photo_file:
            return Response({
                'error': 'No photograph file was provided.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Check maximum file size (20MB) before parsing image bytes
        if photo_file.size > 20 * 1024 * 1024:
            return Response({
                'error': 'Photograph file size exceeds the 20MB limit.'
            }, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        # Validate that the file is an image
        try:
            from PIL import Image
            test_img = Image.open(photo_file)
            test_img.verify()
            photo_file.seek(0)
        except Exception:
            return Response({
                'error': 'Invalid image file. The uploaded file is corrupt or not an image.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 6. Save photo atomically with concurrency handling
        try:
            with transaction.atomic():
                plant_photo = PlantRecordPhoto.objects.create(
                    photo_id=photo_uuid,
                    record=record,
                    photo=photo_file,
                    original_filename=request.data.get('original_filename') or photo_file.name,
                    file_size=getattr(photo_file, 'size', None),
                    mime_type=getattr(photo_file, 'content_type', ''),
                )
                if not record.photo and plant_photo.photo:
                    record.photo = plant_photo.photo
                    record.save(update_fields=['photo'])
        except IntegrityError:
            # Race condition: concurrent duplicate photo upload
            existing_photo = PlantRecordPhoto.objects.filter(photo_id=photo_uuid).first()
            if existing_photo:
                photo_url = request.build_absolute_uri(existing_photo.photo.url) if existing_photo.photo else None
                return Response({
                    'success': True,
                    'already_exists': True,
                    'photo_id': str(existing_photo.photo_id),
                    'record_id': existing_photo.record.id,
                    'tracking_id': existing_photo.record.tracking_id,
                    'photo_url': photo_url,
                    'message': 'Photograph already uploaded.',
                }, status=status.HTTP_200_OK)
            raise

        photo_url = request.build_absolute_uri(plant_photo.photo.url) if plant_photo.photo else None
        return Response({
            'success': True,
            'already_exists': False,
            'photo_id': str(plant_photo.photo_id),
            'record_id': record.id,
            'tracking_id': record.tracking_id,
            'photo_url': photo_url,
            'message': 'Photograph uploaded successfully.',
        }, status=status.HTTP_201_CREATED)




# ---------------------------------------------------------------------------
# Admin API views (JWT auth required)
# ---------------------------------------------------------------------------

class GeoTrackerRecordsView(APIView):
    permission_classes = [IsAdminOrManagerOrSupervisor]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        qs = PlantRecord.objects.select_related('variety').all()

        allowed = get_user_allowed_areas(request.user)
        if '*' not in allowed:
            qs = qs.filter(zone__in=allowed)

        # Filters
        plant_type = request.query_params.get('plant_type')
        if plant_type:
            qs = qs.filter(plant_type=plant_type)

        variety_id = request.query_params.get('variety')
        if variety_id:
            qs = qs.filter(variety_id=variety_id)

        zone = request.query_params.get('zone')
        if zone:
            qs = qs.filter(zone=zone)

        condition = request.query_params.get('condition')
        if condition:
            qs = qs.filter(condition=condition)

        query = request.query_params.get('q')
        if query:
            qs = qs.filter(
                Q(tracking_id__icontains=query)
                | Q(local_name__icontains=query)
                | Q(scientific_name__icontains=query)
                | Q(variety__name__icontains=query)
            )

        serializer = PlantRecordSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)


class GeoTrackerRecordDetailView(APIView):
    permission_classes = [IsAdminOrManagerOrSupervisor]

    def get(self, request, pk):
        try:
            record = PlantRecord.objects.select_related('variety').get(pk=pk)
        except PlantRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_user_authorized_for_zone(request.user, record.zone):
            return Response({'error': f"You are not authorized to access records in '{record.zone}'."}, status=status.HTTP_403_FORBIDDEN)
        serializer = PlantRecordSerializer(record, context={'request': request})
        return Response(serializer.data)

    def delete(self, request, pk):
        try:
            record = PlantRecord.objects.get(pk=pk)
        except PlantRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_user_authorized_for_zone(request.user, record.zone):
            return Response({'error': f"You are not authorized to delete records in '{record.zone}'."}, status=status.HTTP_403_FORBIDDEN)
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        try:
            record = PlantRecord.objects.select_related('variety').get(pk=pk)
        except PlantRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not is_user_authorized_for_zone(request.user, record.zone):
            return Response({'error': f"You are not authorized to modify records in '{record.zone}'."}, status=status.HTTP_403_FORBIDDEN)

        new_zone = request.data.get('zone')
        if new_zone and new_zone != record.zone:
            if not is_user_authorized_for_zone(request.user, new_zone):
                return Response({'error': f"You are not authorized to reassign records to campus area '{new_zone}'."}, status=status.HTTP_403_FORBIDDEN)

        expected_version = request.data.get('expected_version')
        if expected_version is not None:
            try:
                if int(expected_version) != record.version:
                    return Response({
                        'error': 'Conflict: Record has been modified on the server.',
                        'conflict': True,
                        'server_record': PlantRecordSerializer(record, context={'request': request}).data,
                    }, status=status.HTTP_409_CONFLICT)
            except (ValueError, TypeError):
                pass
        else:
            expected_submitted_at = request.data.get('expected_submitted_at')
            if expected_submitted_at:
                if record.submitted_at.isoformat() != expected_submitted_at:
                    return Response({
                        'error': 'Conflict: Record has been modified on the server.',
                        'conflict': True,
                        'server_record': PlantRecordSerializer(record, context={'request': request}).data,
                    }, status=status.HTTP_409_CONFLICT)

        serializer = PlantRecordUpdateSerializer(record, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        updated_record = serializer.save()
        PlantRecord.objects.filter(pk=updated_record.pk).update(version=F('version') + 1)
        record.refresh_from_db()

        return Response(PlantRecordSerializer(record, context={'request': request}).data)


class GeoTrackerExportCSVView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        qs = PlantRecord.objects.select_related('variety').all()

        plant_type = request.query_params.get('plant_type')
        if plant_type:
            qs = qs.filter(plant_type=plant_type)

        variety_id = request.query_params.get('variety')
        if variety_id:
            qs = qs.filter(variety_id=variety_id)

        zone = request.query_params.get('zone')
        if zone:
            qs = qs.filter(zone=zone)

        condition = request.query_params.get('condition')
        if condition:
            qs = qs.filter(condition=condition)

        query = request.query_params.get('q')
        if query:
            qs = qs.filter(
                Q(tracking_id__icontains=query)
                | Q(local_name__icontains=query)
                | Q(scientific_name__icontains=query)
                | Q(variety__name__icontains=query)
            )

        csv_data = records_to_csv(qs)
        response = HttpResponse(csv_data, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="plant_records.csv"'
        return response


class GeoTrackerVarietiesView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        varieties = PlantVariety.objects.all().order_by('plant_type', 'name')
        plant_type = request.query_params.get('plant_type')
        if plant_type:
            varieties = varieties.filter(plant_type=plant_type)
        serializer = PlantVarietySerializer(varieties, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PlantVarietySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class GeoTrackerVarietyDetailView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def put(self, request, pk):
        return self._save(request, pk, partial=False)

    def patch(self, request, pk):
        return self._save(request, pk, partial=True)

    def _save(self, request, pk, partial=False):
        variety = get_object_or_404(PlantVariety, pk=pk)
        serializer = PlantVarietySerializer(variety, data=request.data, partial=partial)
        if serializer.is_valid():
            saved_variety = serializer.save()
            if request.data.get('sync_records', True):
                PlantRecord.objects.filter(variety=saved_variety).update(
                    local_name=saved_variety.name,
                    scientific_name=saved_variety.scientific_name,
                    plant_type=saved_variety.plant_type,
                )
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        variety = get_object_or_404(PlantVariety, pk=pk)
        variety.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GeoTrackerZonesView(APIView):
    """Return the full CampusArea choice list as {value, label} objects.

    The response is now the *canonical* fixed list rather than whatever
    distinct strings happen to exist in the database.  This lets the frontend
    populate a dropdown without needing to fetch records first.
    """
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        return Response([
            {'value': value, 'label': label}
            for value, label in campus_area_choices()
        ])


class GeoTrackerStatsView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        total_records = PlantRecord.objects.count()
        total_plants = PlantRecord.objects.aggregate(
            total=Coalesce(Sum('plant_count'), Value(0))
        )['total']

        trees_plants = PlantRecord.objects.filter(plant_type='tree').aggregate(
            total=Coalesce(Sum('plant_count'), Value(0))
        )['total']
        plants_count = PlantRecord.objects.filter(plant_type='plant').aggregate(
            total=Coalesce(Sum('plant_count'), Value(0))
        )['total']
        creepers_plants = PlantRecord.objects.filter(plant_type='creeper').aggregate(
            total=Coalesce(Sum('plant_count'), Value(0))
        )['total']
        shrubs_plants = PlantRecord.objects.filter(plant_type='shrub').aggregate(
            total=Coalesce(Sum('plant_count'), Value(0))
        )['total']

        trees_records = PlantRecord.objects.filter(plant_type='tree').count()
        plants_records = PlantRecord.objects.filter(plant_type='plant').count()
        creepers_records = PlantRecord.objects.filter(plant_type='creeper').count()
        shrubs_records = PlantRecord.objects.filter(plant_type='shrub').count()

        return Response({
            'total': total_records,
            'total_plants': total_plants,
            'trees': trees_records,
            'trees_plants': trees_plants,
            'plants': plants_records,
            'plants_plants': plants_count,
            'creepers': creepers_records,
            'creepers_plants': creepers_plants,
            'shrubs': shrubs_records,
            'shrubs_plants': shrubs_plants,
        })

class GeoTrackerAreasView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        # return hardcoded + DB areas combined
        return Response([
            {'value': v, 'label': l}
            for v, l in campus_area_choices()
        ])

    def post(self, request):
        label    = request.data.get('label', '').strip()
        db_value = request.data.get('db_value', '').strip()
        code     = request.data.get('code', '').strip().upper()

        if not label or not db_value or not code:
            return Response({'error': 'label, db_value and code are required.'}, status=400)
        if len(code) != 3:
            return Response({'error': 'code must be exactly 3 characters.'}, status=400)
        if CampusAreaConfig.objects.filter(db_value=db_value).exists():
            return Response({'error': 'Area with this db_value already exists.'}, status=400)
        if CampusAreaConfig.objects.filter(code=code).exists():
            return Response({'error': 'Area with this code already exists.'}, status=400)

        area = CampusAreaConfig.objects.create(label=label, db_value=db_value, code=code)
        return Response({'id': area.id, 'label': area.label, 'db_value': area.db_value, 'code': area.code}, status=201)
