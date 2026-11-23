from rest_framework.routers import DefaultRouter

from .views import CasualLaborerViewSet, LaborPayPeriodViewSet

router = DefaultRouter()
router.register("laborers", CasualLaborerViewSet, basename="casual-laborer")
router.register("pay-periods", LaborPayPeriodViewSet, basename="labor-pay-period")
urlpatterns = router.urls
