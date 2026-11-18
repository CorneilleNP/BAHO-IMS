from rest_framework.routers import DefaultRouter

from .views import CwsTransferViewSet, DryMillTransferReceiptViewSet

router = DefaultRouter()
router.register("cws", CwsTransferViewSet, basename="cws-transfer")
router.register("dry-mill", DryMillTransferReceiptViewSet, basename="dry-mill-transfer-receipt")

urlpatterns = router.urls
