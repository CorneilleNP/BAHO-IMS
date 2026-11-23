from django.urls import path

from .views import StockLedgerView

urlpatterns = [path("ledger/", StockLedgerView.as_view(), name="stock-ledger")]
