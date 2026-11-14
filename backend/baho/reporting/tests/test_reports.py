from datetime import date, timedelta
from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade
from tests.helpers import login

pytestmark = pytest.mark.django_db


def test_empty_database_gives_zero_dashboards(api, hq_finance):
    login(api, hq_finance)
    stock = api.get("/api/v1/reporting/drymill/stock/").data
    assert stock["day"]["net_weight_kg"] == 0
    assert stock["by_source"] == []
    export = api.get("/api/v1/reporting/drymill/export/").data
    assert export["exported_kg"] == 0
    assert export["stock_balance_kg"] == 0


def test_stock_summary_totals_by_day_and_source(api, drymill_operator, gitoki):
    login(api, drymill_operator)
    today = date.today()
    yesterday = today - timedelta(days=1)
    if yesterday.year != today.year:  # keep both dates inside the test crop year
        today, yesterday = today + timedelta(days=1), today
    for day, kg in [(yesterday, "1000"), (today, "1500"), (today, "500")]:
        res = api.post(
            "/api/v1/drymill/stock-receipts/",
            {
                "arrival_date": day.isoformat(),
                "origin_type": "OWN_CWS",
                "source_facility": str(gitoki.id),
                "process": "FW",
                "grade": "A1",
                "net_weight_kg": kg,
                "weight_of_bags_kg": "10",
            },
            format="json",
        )
        assert res.status_code == 201, res.data

    data = api.get(f"/api/v1/reporting/drymill/stock/?date={today.isoformat()}").data
    assert Decimal(data["day"]["net_weight_kg"]) == Decimal("2000")
    assert Decimal(data["day"]["pure_weight_kg"]) == Decimal("1980")
    assert Decimal(data["change_vs_previous_pct"]) == Decimal("100.00")
    assert data["by_source"] == [{"label": "GITOKI", "kg": Decimal("3000.00")}]


def test_export_balance_is_produced_minus_exported(api, drymill_operator, export_manager, gitoki):
    g15 = ExportGrade.objects.get(code="15PLUS")
    login(api, drymill_operator)
    api.post(
        "/api/v1/drymill/batches/",
        {
            "origin_type": "OWN_CWS",
            "source_facility": str(gitoki.id),
            "process_product": "FULLWASHED A1",
            "parch_input_kg": "10000",
            "outputs": [{"export_grade": str(g15.id), "qty_kg": "7000"}],
        },
        format="json",
    )
    login(api, export_manager)
    client = api.post("/api/v1/sales/clients/", {"name": "RTC"}).data
    api.post(
        "/api/v1/sales/shipments/",
        {
            "client": client["id"],
            "lines": [
                {"process_product": "FULLWASHED A1", "export_grade": str(g15.id), "qty_kg": "2500"}
            ],
        },
        format="json",
    )
    data = api.get("/api/v1/reporting/drymill/export/").data
    assert Decimal(data["exported_kg"]) == Decimal("2500")
    assert Decimal(data["stock_balance_kg"]) == Decimal("4500")
    row = next(g for g in data["by_grade"] if g["code"] == "15PLUS")
    assert (row["produced_kg"], row["exported_kg"], row["balance_kg"]) == (
        Decimal("7000.00"),
        Decimal("2500.00"),
        Decimal("4500.00"),
    )
    assert data["by_client"][0]["label"] == "RTC"

    processing = api.get("/api/v1/reporting/drymill/processing/").data
    assert Decimal(processing["totals"]["outturn_pct"]) == Decimal("70.00")
    assert Decimal(processing["totals"]["hg_outturn_pct"]) == Decimal("70.00")


def test_cws_clerk_cannot_open_dry_mill_reports(api, gitoki_clerk):
    login(api, gitoki_clerk)
    assert api.get("/api/v1/reporting/drymill/stock/").status_code == 403
