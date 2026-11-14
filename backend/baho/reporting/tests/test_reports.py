from datetime import date, timedelta
from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade
from baho.processing.models import Process
from tests.factories import produce_green
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


def test_stock_summary_totals_by_day_and_source(api, drymill_operator, gitoki, hq):
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
                "source_facility": str(gitoki.id),
                "process": str(Process.objects.get(code="FW").id),
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
    assert data["by_process"] == [{"label": "Fully Washed", "kg": Decimal("3000.00")}]
    assert Decimal(data["season"]["stock_balance_kg"]) == Decimal("2970")


def test_export_balance_is_produced_minus_exported(api, export_manager, gitoki, hq):
    g15 = ExportGrade.objects.get(code="15PLUS")
    produce_green(gitoki, "15PLUS", kg="7000", parch="10000")
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


def test_processing_filters_by_process_sub_process_grade_and_shows_stock(
    api, drymill_operator, gitoki, hq
):
    from baho.drymill.services import create_dry_mill_batch
    from baho.processing.models import SubProcess
    from tests.factories import stock_receipt

    fw = Process.objects.get(code="FW")
    nn = Process.objects.get(code="NN")
    sub = SubProcess.objects.create(name="WASHED NO 1", process=fw)
    a1 = stock_receipt(gitoki, net="1000", process=fw, sub_process=sub, grade="A1")
    hg = stock_receipt(gitoki, net="500", process=nn, grade="HG")
    g15 = ExportGrade.objects.get(code="15PLUS")
    create_dry_mill_batch(
        user=None,
        processing_date=a1.arrival_date,
        process_product="MIX",
        inputs=[
            {"receipt": a1, "qty_kg": Decimal("600")},
            {"receipt": hg, "qty_kg": Decimal("200")},
        ],
        outputs=[{"export_grade": g15, "qty_kg": Decimal("560")}],
    )
    login(api, drymill_operator)
    url = "/api/v1/reporting/drymill/processing/"

    everything = api.get(url).data
    assert Decimal(everything["totals"]["parch_input_kg"]) == Decimal("800")
    assert Decimal(everything["stock"]["received_kg"]) == Decimal("1500")
    assert Decimal(everything["stock"]["milled_kg"]) == Decimal("800")
    assert Decimal(everything["stock"]["balance_kg"]) == Decimal("700")

    fw_only = api.get(f"{url}?process={fw.id}").data
    assert Decimal(fw_only["totals"]["parch_input_kg"]) == Decimal("600")  # only the FW receipt
    assert Decimal(fw_only["stock"]["balance_kg"]) == Decimal("400")
    assert api.get(f"{url}?sub_process={sub.id}").data["stock"]["receipts"] == 1
    hg_only = api.get(f"{url}?grade=HG").data
    assert Decimal(hg_only["stock"]["milled_kg"]) == Decimal("200")
    assert {r["label"] for r in everything["by_process"]} == {"Fully Washed", "Normal Natural"}

    batches = api.get("/api/v1/drymill/batches/?grade=HG").data
    assert batches["count"] == 1
    assert {i["grade"] for i in batches["results"][0]["inputs"]} == {"A1", "HG"}
