from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.shortcuts import render


@login_required
def horticulture_dashboard(request):
    if request.user.role not in ['admin', 'horticulture_manager']:
        return HttpResponseForbidden()
    return render(request, 'horticulture/dashboard.html', {})
