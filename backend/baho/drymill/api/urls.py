from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CoffeeSourcesView,
    DryMillBatchViewSet,
    ExportGradeViewSet,
    HqStockReceiptViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("export-grades", ExportGradeViewSet, basename="export-grade")
router.register("stock-receipts", HqStockReceiptViewSet, basename="hq-stock-receipt")
router.register("batches", DryMillBatchViewSet, basename="dry-mill-batch")

urlpatterns = [path("sources/", CoffeeSourcesView.as_view(), name="coffee-sources"), *router.urls]
