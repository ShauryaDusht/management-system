import csv
import io

from rest_framework import serializers

from .models import CampusArea, PlantRecord, PlantVariety


class PlantVarietySerializer(serializers.ModelSerializer):
    class Meta:
        model = PlantVariety
        fields = ['id', 'name', 'plant_type', 'scientific_name']


class PlantRecordSerializer(serializers.ModelSerializer):
    variety_name = serializers.CharField(source='variety.name', read_only=True)
    plant_type_display = serializers.CharField(source='get_plant_type_display', read_only=True)
    condition_display = serializers.CharField(source='get_condition_display', read_only=True)
    # Human-readable campus area label exposed as a dedicated display field.
    zone_display = serializers.CharField(source='get_zone_display',read_only=True)
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
            'zone', 'zone_display',
            'height_m', 'girth_cm', 'canopy_area_m',
            'condition', 'condition_display',
            'photo_url',
            'notes', 'gps_accuracy_m',
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


class PlantRecordUpdateSerializer(serializers.ModelSerializer):
    """Used by the admin detail panel to edit survey/characteristics fields.

    Identity fields (tracking_id, plant_type, variety, local/scientific name)
    and the GPS pin (latitude/longitude, captured in the field) are
    intentionally left out — this serializer only covers the data an admin
    should be able to correct after the fact.
    """

    class Meta:
        model = PlantRecord
        fields = [
            'zone', 'condition',
            'height_m', 'girth_cm', 'canopy_area_m', 'gps_accuracy_m',
            'notes',
        ]
        extra_kwargs = {
            'zone': {'required': False, 'allow_blank': True},
            'condition': {'required': False},
            'notes': {'required': False, 'allow_blank': True},
        }


class PlantRecordCreateSerializer(serializers.ModelSerializer):
    """Used by the public submit form — accepts photo upload."""

    class Meta:
        model = PlantRecord
        fields = [
            'plant_type', 'local_name', 'scientific_name', 'variety',
            'latitude', 'longitude', 'zone',
            'height_m', 'girth_cm', 'canopy_area_m',
            'condition', 'photo', 'notes', 'gps_accuracy_m',
        ]
        read_only_fields = ['plant_type', 'local_name', 'scientific_name']
        extra_kwargs = {
            'variety': {'required': True, 'allow_null': False},
            # zone is required from the mobile form
            'zone': {'required': True, 'allow_blank': False},
        }

    def create(self, validated_data):
        variety = validated_data['variety']
        validated_data.update({
            'plant_type': variety.plant_type,
            'local_name': variety.name,
            'scientific_name': variety.scientific_name,
        })
        return super().create(validated_data)


# ---------------------------------------------------------------------------
# Campus-area choices helper (used by views / templates)
# ---------------------------------------------------------------------------

def campus_area_choices():
    """Return list of (value, label) tuples for all CampusArea values."""
    return CampusArea.choices


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

def records_to_csv(queryset):
    """Return a CSV string for the given PlantRecord queryset.

    The human-readable campus area label (e.g. "Housing Zone") is exported
    rather than the internal key (e.g. "housing_zone").
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'ID', 'Type', 'Local Name', 'Scientific Name', 'Variety',
        'Latitude', 'Longitude', 'Campus Area', 'Location Notes',
        'Height (m)', 'Girth (cm)', 'Canopy Span (m)',
        'Condition', 'Notes', 'GPS Accuracy (m)', 'Submitted At',
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
            # Use the human-readable label; fall back to raw value for legacy rows
            r.get_zone_display() if r.zone else '',
            r.height_m or '',
            r.girth_cm or '',
            r.canopy_area_m or '',
            r.get_condition_display(),
            r.notes,
            r.gps_accuracy_m or '',
            r.submitted_at.strftime('%Y-%m-%d %H:%M') if r.submitted_at else '',
        ])
    return output.getvalue()