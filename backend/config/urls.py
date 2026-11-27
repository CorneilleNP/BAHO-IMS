from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1 = [
    path("auth/", include("baho.accounts.api.urls")),
    path("organization/", include("baho.organization.api.urls")),
    path("farmers/", include("baho.farmers.api.urls")),
    path("reception/", include("baho.reception.api.urls")),
    path("finance/", include("baho.finance.api.urls")),
    path("processing/", include("baho.processing.api.urls")),
    path("drymill/", include("baho.drymill.api.urls")),
    path("sales/", include("baho.sales.api.urls")),
    path("transfers/", include("baho.transfers.api.urls")),
    path("reporting/", include("baho.reporting.api.urls")),
    path("labor/", include("baho.labor.api.urls")),
    path("inventory/", include("baho.inventory.api.urls")),
    path("imports/", include("baho.imports.api.urls")),
    path("core/", include("baho.core.api.urls")),
    path("notifications/", include("baho.notifications.api.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

# API docs publish the whole API layout, so they are off in production unless
# API_DOCS_ENABLED is set (and then staff-only, see settings/prod.py).
if settings.API_DOCS_ENABLED:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    ]

admin.site.site_header = "Baho Coffee IMS"
admin.site.site_title = "Baho IMS admin"
