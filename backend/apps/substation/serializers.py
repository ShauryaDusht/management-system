from rest_framework import serializers
from .models import SubstationSheet, SubstationReading, SubstationConfigDoc


class SubstationSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubstationSheet
        fields = '__all__'


class SubstationReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubstationReading
        fields = '__all__'


class SubstationConfigDocSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubstationConfigDoc
        fields = ['key', 'data', 'updated_at']
