from django.urls import path

from apps.core.setup_views import setup_page


urlpatterns = [
    path('setup/', setup_page, name='setup'),
]
