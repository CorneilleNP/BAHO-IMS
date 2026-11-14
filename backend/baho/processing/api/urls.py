from rest_framework.routers import DefaultRouter

from .catalog import ProcessViewSet, SubProcessViewSet
from .views import ProcessingLotViewSet, ProcessTypeViewSet

router = DefaultRouter()
router.register("process-types", ProcessTypeViewSet, basename="process-type")
router.register("lots", ProcessingLotViewSet, basename="processing-lot")
router.register("catalog/processes", ProcessViewSet, basename="catalog-process")
router.register("catalog/sub-processes", SubProcessViewSet, basename="catalog-sub-process")
urlpatterns = router.urls
