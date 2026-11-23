from django.urls import path

from .views import CherryReceiptImportView

urlpatterns = [
    path("cherry-receipts/", CherryReceiptImportView.as_view(), name="import-cherry-receipts"),
]
