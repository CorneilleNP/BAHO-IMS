from django.urls import path

from .views import ExportSummaryView, ProcessingSummaryView, StockSummaryView

urlpatterns = [
    path("drymill/stock/", StockSummaryView.as_view(), name="report-drymill-stock"),
    path("drymill/processing/", ProcessingSummaryView.as_view(), name="report-drymill-processing"),
    path("drymill/export/", ExportSummaryView.as_view(), name="report-drymill-export"),
]
