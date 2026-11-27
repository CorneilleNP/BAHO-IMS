from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ExpenseCategoryViewSet,
    ExpenseViewSet,
    FinanceLedgerView,
    FinanceSummaryView,
    FundAllocationViewSet,
)

router = DefaultRouter()
router.register("categories", ExpenseCategoryViewSet, basename="expense-category")
router.register("allocations", FundAllocationViewSet, basename="fund-allocation")
router.register("expenses", ExpenseViewSet, basename="expense")
urlpatterns = [
    path("summary/", FinanceSummaryView.as_view(), name="finance-summary"),
    path("ledger/", FinanceLedgerView.as_view(), name="finance-ledger"),
    *router.urls,
]
