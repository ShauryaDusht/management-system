from django.http.request import split_domain_port
from django.shortcuts import render


def setup_page(request):
    domain, _port = split_domain_port(request.get_host())
    host = domain or request.get_host().split(':', 1)[0]

    context = {
        'app_name': 'IITGN Management System',
        'download_url': f'http://{host}:8000/ca.crt',
        'portal_url': f'https://{host}:8443/portal/',
    }
    return render(request, 'core/setup.html', context)
