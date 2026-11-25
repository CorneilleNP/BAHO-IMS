from django.urls import path

from .views import TrashView

urlpatterns = [path("trash/", TrashView.as_view(), name="trash")]
