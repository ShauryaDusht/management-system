from datetime import date, datetime
from rest_framework import serializers
from .models import LiftLicense, LiftLicenseDocument


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


class LiftLicenseDocumentSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    formatted_valid_from = serializers.SerializerMethodField()
    formatted_valid_till = serializers.SerializerMethodField()

    class Meta:
        model = LiftLicenseDocument
        fields = [
            'id',
            'lift',
            'pdf_file',
            'pdf_url',
            'file_name',
            'file_size',
            'title',
            'license_no',
            'valid_from',
            'valid_till',
            'formatted_valid_from',
            'formatted_valid_till',
            'is_current',
            'uploaded_by',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'pdf_url', 'file_name', 'file_size', 'formatted_valid_from', 'formatted_valid_till']

    def get_pdf_url(self, obj):
        if not obj.pdf_file:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.pdf_file.url)
        return obj.pdf_file.url

    def get_file_name(self, obj):
        if not obj.pdf_file:
            return ''
        import os
        return os.path.basename(obj.pdf_file.name)

    def get_file_size(self, obj):
        if not obj.pdf_file:
            return 0
        try:
            return obj.pdf_file.size
        except Exception:
            return 0

    def get_formatted_valid_from(self, obj):
        return obj.valid_from.strftime('%d.%m.%Y') if obj.valid_from else None

    def get_formatted_valid_till(self, obj):
        return obj.valid_till.strftime('%d.%m.%Y') if obj.valid_till else None


class LiftLicenseSerializer(serializers.ModelSerializer):
    frm = FlexibleDateField(required=False, allow_null=True)
    till = FlexibleDateField(required=False, allow_null=True)
    applied_date = FlexibleDateField(required=False, allow_null=True)
    days_remaining = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    iso_frm = serializers.SerializerMethodField()
    iso_till = serializers.SerializerMethodField()
    iso_applied_date = serializers.SerializerMethodField()
    formatted_applied_date = serializers.SerializerMethodField()
    documents_count = serializers.SerializerMethodField()
    current_document = serializers.SerializerMethodField()

    class Meta:
        model = LiftLicense
        fields = [
            'id',
            'loc',
            'lift',
            'no',
            'equipment_no',
            'prov',
            'frm',
            'till',
            'iso_frm',
            'iso_till',
            'is_applied',
            'applied_date',
            'application_no',
            'applied_notes',
            'iso_applied_date',
            'formatted_applied_date',
            'eng',
            'rem',
            'order',
            'days_remaining',
            'status',
            'documents_count',
            'current_document',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'days_remaining',
            'status',
            'iso_frm',
            'iso_till',
            'iso_applied_date',
            'formatted_applied_date',
            'documents_count',
            'current_document',
        ]

    def get_days_remaining(self, obj):
        return obj.days_remaining()

    def get_status(self, obj):
        threshold = self.context.get('threshold_days', 30)
        return obj.compute_status(threshold_days=threshold)

    def get_iso_applied_date(self, obj):
        return obj.applied_date.isoformat() if obj.applied_date else None

    def get_formatted_applied_date(self, obj):
        return obj.applied_date.strftime('%d.%m.%Y') if obj.applied_date else None

    def get_iso_frm(self, obj):
        return obj.frm.isoformat() if obj.frm else None

    def get_iso_till(self, obj):
        return obj.till.isoformat() if obj.till else None

    def get_documents_count(self, obj):
        return obj.documents.count()

    def get_current_document(self, obj):
        doc = obj.documents.filter(is_current=True).first() or obj.documents.first()
        if not doc:
            return None
        return LiftLicenseDocumentSerializer(doc, context=self.context).data

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
