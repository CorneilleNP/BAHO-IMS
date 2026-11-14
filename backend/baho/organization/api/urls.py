from rest_framework.routers import DefaultRouter

from .views import AdminUnitViewSet, CropYearViewSet, FacilityViewSet

router = DefaultRouter()
router.register("crop-years", CropYearViewSet)
router.register("facilities", FacilityViewSet)
router.register("admin-units", AdminUnitViewSet)

urlpatterns = router.urls
