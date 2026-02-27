from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class InventoryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .generators import generate_inventory_report
        data = generate_inventory_report()
        return Response(data)


class RequestsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .generators import generate_requests_report
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        data = generate_requests_report(date_from, date_to)
        return Response(data)


class IssuesReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .generators import generate_issues_report
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        data = generate_issues_report(date_from, date_to)
        return Response(data)


class StockMovementReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .generators import generate_stock_movement_report
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        data = generate_stock_movement_report(date_from, date_to)
        return Response(data)
