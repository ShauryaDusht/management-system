import json
from decimal import Decimal
from django.http import HttpResponse, JsonResponse
from django.db.models import Q
from django.shortcuts import render, get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminOrHKInventoryOrHorticultureManager

from .models import (
    CampusArea, PlantRecord, PlantVariety, CampusAreaConfig,
)
from .serializers import (
    PlantRecordSerializer,
    PlantRecordCreateSerializer,
    PlantRecordUpdateSerializer,
    PlantVarietySerializer,
    campus_area_choices,
    records_to_csv,
)


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

    serializer = PlantRecordCreateSerializer(data=data)
    if not serializer.is_valid():
        return JsonResponse({'errors': serializer.errors}, status=400)

    record = serializer.save()

    if 'photo' in request.FILES:
        record.photo = request.FILES['photo']
        record.save(update_fields=['photo'])

    return JsonResponse({
        'success': True,
        'id': record.tracking_id,
        'record_pk': record.id,
        'message': 'Record submitted successfully.',
    }, status=201)


# ---------------------------------------------------------------------------
# Admin API views (JWT auth required)
# ---------------------------------------------------------------------------

class GeoTrackerRecordsView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        qs = PlantRecord.objects.select_related('variety').all()

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
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request, pk):
        try:
            record = PlantRecord.objects.select_related('variety').get(pk=pk)
        except PlantRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PlantRecordSerializer(record, context={'request': request})
        return Response(serializer.data)

    def delete(self, request, pk):
        try:
            record = PlantRecord.objects.get(pk=pk)
        except PlantRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        try:
            record = PlantRecord.objects.select_related('variety').get(pk=pk)
        except PlantRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = PlantRecordUpdateSerializer(record, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
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
        total = PlantRecord.objects.count()
        trees = PlantRecord.objects.filter(plant_type='tree').count()
        plants = PlantRecord.objects.filter(plant_type='plant').count()
        creepers = PlantRecord.objects.filter(plant_type='creeper').count()
        shrubs = PlantRecord.objects.filter(plant_type='shrub').count()
        return Response({
            'total': total,
            'trees': trees,
            'plants': plants,
            'creepers': creepers,
            'shrubs': shrubs,
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
