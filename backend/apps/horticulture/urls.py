from django.urls import path
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class HorticultureStubView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'zones': [], 'workers': [], 'tasks': []})


urlpatterns = [
    path('summary/', HorticultureStubView.as_view(), name='horti-summary'),
]
