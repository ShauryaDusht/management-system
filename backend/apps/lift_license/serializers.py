from datetime import date, datetime
from rest_framework import serializers
from .models import LiftLicense


def parse_date_flexibly(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    val_str = str(value).strip()
    if not val_str:
        return None
    # Try DD.MM.YYYY
    if '.' in val_str:
        try:
            return datetime.strptime(val_str, '%d.%m.%Y').date()
        except ValueError:
            pass
    # Try YYYY-MM-DD
    if '-' in val_str:
        try:
            return datetime.strptime(val_str[:10], '%Y-%m-%d').date()
        except ValueError:
            pass
    # Try DD-MM-YYYY
    try:
        return datetime.strptime(val_str, '%d-%m-%Y').date()
    except ValueError:
        pass
    raise serializers.ValidationError(f"Invalid date format '{val_str}'. Use DD.MM.YYYY or YYYY-MM-DD.")


class FlexibleDateField(serializers.DateField):
    def to_internal_value(self, value):
        return parse_date_flexibly(value)

    def to_representation(self, value):
        if not value:
            return None
        # Format as DD.MM.YYYY for consistency with existing lift license data
        return value.strftime('%d.%m.%Y')


class LiftLicenseSerializer(serializers.ModelSerializer):
    frm = FlexibleDateField(required=False, allow_null=True)
    till = FlexibleDateField(required=False, allow_null=True)
    days_remaining = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    iso_frm = serializers.SerializerMethodField()
    iso_till = serializers.SerializerMethodField()

    class Meta:
        model = LiftLicense
        fields = [
            'id',
            'loc',
            'lift',
            'no',
            'prov',
            'frm',
            'till',
            'iso_frm',
            'iso_till',
            'eng',
            'rem',
            'order',
            'days_remaining',
            'status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'days_remaining', 'status', 'iso_frm', 'iso_till']

    def get_days_remaining(self, obj):
        return obj.days_remaining()

    def get_status(self, obj):
        threshold = self.context.get('threshold_days', 30)
        return obj.compute_status(threshold_days=threshold)

    def get_iso_frm(self, obj):
        return obj.frm.isoformat() if obj.frm else None

    def get_iso_till(self, obj):
        return obj.till.isoformat() if obj.till else None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if not ret.get('eng'):
            ret['eng'] = 'Mr. Naveen Rai'
        return ret

    def validate(self, attrs):
        if not attrs.get('eng') or not str(attrs.get('eng')).strip():
            attrs['eng'] = 'Mr. Naveen Rai'
        frm = attrs.get('frm')
        till = attrs.get('till')
        if frm and till and till < frm:
            raise serializers.ValidationError({"till": "Valid till date must be after valid from date."})
        return attrs
