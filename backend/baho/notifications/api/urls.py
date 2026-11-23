from rest_framework.routers import DefaultRouter

from .views import SmsMessageViewSet

router = DefaultRouter()
router.register("sms", SmsMessageViewSet, basename="sms-message")
urlpatterns = router.urls
