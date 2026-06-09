import csv
import io

from rest_framework import serializers

from .models import PlantRecord, PlantVariety


class PlantVarietySerializer(serializers.ModelSerializer):
    class Meta:
        model = PlantVariety
        fields = ['id', 'name', 'plant_type', 'scientific_name']


class PlantRecordSerializer(serializers.ModelSerializer):
    variety_name = serializers.CharField(source='variety.name', read_only=True)
    plant_type_display = serializers.CharField(source='get_plant_type_display', read_only=True)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    photo_url = serializers.SerializerMethodField()
    lat = serializers.FloatField(read_only=True)
    lng = serializers.FloatField(read_only=True)

    class Meta:
        model = PlantRecord
        fields = [
            'id', 'tracking_id',
            'plant_type', 'plant_type_display',
            'local_name', 'scientific_name',
            'variety', 'variety_name',
            'latitude', 'longitude', 'lat', 'lng',
            'zone', 'location_notes',
            'height_m', 'girth_cm',
            'condition', 'condition_display',
            'photo_url',
            'notes',
            'submitted_at',
        ]
        read_only_fields = ['id', 'tracking_id', 'submitted_at']

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.photo.url)
        return obj.photo.url


class PlantRecordCreateSerializer(serializers.ModelSerializer):
    """Used by the public submit form — accepts photo upload."""

    class Meta:
        model = PlantRecord
        fields = [
            'plant_type', 'local_name', 'scientific_name', 'variety',
            'latitude', 'longitude', 'zone', 'location_notes',
            'height_m', 'girth_cm',
            'condition', 'photo', 'notes',
        ]
        read_only_fields = ['plant_type', 'local_name', 'scientific_name']
        extra_kwargs = {'variety': {'required': True, 'allow_null': False}}

    def create(self, validated_data):
        variety = validated_data['variety']
        validated_data.update({
            'plant_type': variety.plant_type,
            'local_name': variety.name,
            'scientific_name': variety.scientific_name,
        })
        return super().create(validated_data)


def records_to_csv(queryset):
    """Return a CSV string for the given PlantRecord queryset."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'ID', 'Type', 'Local Name', 'Scientific Name', 'Variety',
        'Latitude', 'Longitude', 'Zone', 'Location Notes',
        'Height (m)', 'Girth (cm)',
        'Condition', 'Notes', 'Submitted At',
    ])
    for r in queryset:
        writer.writerow([
            r.tracking_id,
            r.get_plant_type_display(),
            r.local_name,
            r.scientific_name,
            r.variety.name if r.variety else '',
            r.latitude,
            r.longitude,
            r.zone,
            r.location_notes,
            r.height_m or '',
            r.girth_cm or '',
            r.get_condition_display(),
            r.notes,
            r.submitted_at.strftime('%Y-%m-%d %H:%M') if r.submitted_at else '',
        ])
    return output.getvalue()
