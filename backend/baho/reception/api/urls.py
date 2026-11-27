from rest_framework.routers import DefaultRouter

from .views import CherryPaymentViewSet, CherryReceiptViewSet

router = DefaultRouter()
router.register("receipts", CherryReceiptViewSet, basename="cherry-receipt")
router.register("payments", CherryPaymentViewSet, basename="cherry-payment")
urlpatterns = router.urls
