from rest_framework.routers import DefaultRouter

from .views import ProcessingLotViewSet, ProcessTypeViewSet

router = DefaultRouter()
router.register("process-types", ProcessTypeViewSet, basename="process-type")
router.register("lots", ProcessingLotViewSet, basename="processing-lot")
urlpatterns = router.urls
