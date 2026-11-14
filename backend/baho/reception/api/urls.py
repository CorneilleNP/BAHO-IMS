from rest_framework.routers import DefaultRouter

from .views import CherryReceiptViewSet

router = DefaultRouter()
router.register("receipts", CherryReceiptViewSet, basename="cherry-receipt")
urlpatterns = router.urls
