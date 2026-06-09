from django.http import HttpResponse, JsonResponse
from django.db.models import Q
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminOrHKInventoryOrHorticultureManager

from .models import PlantRecord, PlantVariety
from .serializers import (
    PlantRecordSerializer,
    PlantRecordCreateSerializer,
    PlantVarietySerializer,
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
            qs = qs.filter(zone__iexact=zone)

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
                | Q(zone__icontains=query)
                | Q(location_notes__icontains=query)
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
            qs = qs.filter(zone__iexact=zone)

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
                | Q(zone__icontains=query)
                | Q(location_notes__icontains=query)
            )

        csv_data = records_to_csv(qs)
        response = HttpResponse(csv_data, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="plant_records.csv"'
        return response


class GeoTrackerVarietiesView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        varieties = PlantVariety.objects.all()
        plant_type = request.query_params.get('plant_type')
        if plant_type:
            varieties = varieties.filter(plant_type=plant_type)
        serializer = PlantVarietySerializer(varieties, many=True)
        return Response(serializer.data)


class GeoTrackerZonesView(APIView):
    """Return distinct zone values present in records."""
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        zones = (
            PlantRecord.objects
            .exclude(zone='')
            .values_list('zone', flat=True)
            .distinct()
            .order_by('zone')
        )
        return Response(list(zones))


class GeoTrackerStatsView(APIView):
    permission_classes = [IsAdminOrHKInventoryOrHorticultureManager]

    def get(self, request):
        total = PlantRecord.objects.count()
        trees = PlantRecord.objects.filter(plant_type='tree').count()
        plants = PlantRecord.objects.filter(plant_type='plant').count()
        creepers = PlantRecord.objects.filter(plant_type='creeper').count()
        return Response({
            'total': total,
            'trees': trees,
            'plants': plants,
            'creepers': creepers,
        })
