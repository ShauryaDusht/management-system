from rest_framework import serializers
from .models import MonthlyReport


class MonthlyReportListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing historical reports."""
    generated_by_name = serializers.SerializerMethodField()
    period_label = serializers.ReadOnlyField()
    csv_url = serializers.SerializerMethodField()
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = MonthlyReport
        fields = [
            'id', 'month', 'year', 'period_label',
            'generated_at', 'generated_by', 'generated_by_name',
            'csv_url', 'pdf_url',
            # summary fields pulled from snapshot
            'total_items', 'items_needing_reorder', 'total_estimated_cost',
        ]

    def get_generated_by_name(self, obj):
        if obj.generated_by:
            return obj.generated_by.get_full_name() or obj.generated_by.username
        return None

    def get_csv_url(self, obj):
        if obj.csv_file:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.csv_file.url) if request else obj.csv_file.url
        return None

    def get_pdf_url(self, obj):
        if obj.pdf_file:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.pdf_file.url) if request else obj.pdf_file.url
        return None

    # Pull summary numbers directly from stored snapshot
    def get_total_items(self, obj):
        return obj.snapshot.get('total_items', 0)

    def get_items_needing_reorder(self, obj):
        return obj.snapshot.get('items_needing_reorder', 0)

    def get_total_estimated_cost(self, obj):
        return obj.snapshot.get('total_estimated_cost', 0)

    # Override to_representation to add computed snapshot fields
    def to_representation(self, instance):
        data = super().to_representation(instance)
        snap = instance.snapshot or {}
        data['total_items'] = snap.get('total_items', 0)
        data['items_needing_reorder'] = snap.get('items_needing_reorder', 0)
        data['total_estimated_cost'] = snap.get('total_estimated_cost', 0)
        return data


class MonthlyReportDetailSerializer(MonthlyReportListSerializer):
    """Full serializer including the snapshot item rows."""

    class Meta(MonthlyReportListSerializer.Meta):
        fields = MonthlyReportListSerializer.Meta.fields + ['snapshot']
