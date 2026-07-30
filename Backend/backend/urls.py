"""CommerceX URL configuration."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

API = "api/v1/"


def health(request):
    return JsonResponse({"status": "ok", "service": "commercex", "version": "1.0.0"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health, name="health"),

    path(API, include("accounts.urls")),
    path(API, include("shops.urls")),
    path(API, include("products.urls")),
    path(API, include("cart.urls")),
    path(API, include("orders.urls")),
    path(API, include("notices.urls")),
    path(API, include("messaging.urls")),
    path(API, include("billing.urls")),
    path(API, include("assistant.urls")),

    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

admin.site.site_header = "CommerceX Administration"
admin.site.site_title = "CommerceX"
admin.site.index_title = "Platform management"
