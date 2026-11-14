from rest_framework.routers import DefaultRouter

from .views import ClientViewSet, ExportShipmentViewSet

router = DefaultRouter()
router.register("clients", ClientViewSet, basename="client")
router.register("shipments", ExportShipmentViewSet, basename="export-shipment")
urlpatterns = router.urls
