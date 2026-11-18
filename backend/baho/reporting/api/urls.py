from django.urls import path

from .views import (
    CwsSummaryView,
    ExportSummaryView,
    LotSummaryView,
    ProcessingSummaryView,
    StockSummaryView,
    TransferSummaryView,
)

urlpatterns = [
    path("drymill/stock/", StockSummaryView.as_view(), name="report-drymill-stock"),
    path("drymill/processing/", ProcessingSummaryView.as_view(), name="report-drymill-processing"),
    path("drymill/export/", ExportSummaryView.as_view(), name="report-drymill-export"),
    path("cws/", CwsSummaryView.as_view(), name="report-cws"),
    path("cws/lots/", LotSummaryView.as_view(), name="report-cws-lots"),
    path("transfers/", TransferSummaryView.as_view(), name="report-transfers"),
]
