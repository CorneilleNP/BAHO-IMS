from decimal import Decimal

import pytest

from baho.processing.models import Process, SubProcess
from tests.factories import stock_receipt
from tests.helpers import login

pytestmark = pytest.mark.django_db
URL = "/api/v1/reporting/cws/lots/"
PROCESSES = "/api/v1/processing/process-types/"
LOTS = "/api/v1/processing/lots/"

FW_GRADES = [{"code": "A1", "ratio": "0.14"}, {"code": "A2", "ratio": "0.04"}]


def register_process(api, facility, process_code):
    process = Process.objects.get(code=process_code)
    return api.post(
        PROCESSES,
        {"facility": str(facility.id), "process": str(process.id), "grades": FW_GRADES},
        format="json",
    ).data


def new_lot(api, process, cherry_kg):
    body = {"process_type": process["id"], "cherry_input_kg": cherry_kg}
    return api.post(LOTS, body, format="json").data


def record_actuals(api, lot, process, a1_kg, a2_kg):
    actuals = [
        {"grade": g["id"], "actual_kg": kg}
        for g, kg in zip(process["grades"], [a1_kg, a2_kg], strict=True)
    ]
    return api.post(f"{LOTS}{lot['id']}/actuals/", {"actuals": actuals}, format="json").data


def test_lot_dashboard_totals_by_grade(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_process(api, gitoki, "FW")
    lot = new_lot(api, process, "355")
    record_actuals(api, lot, process, "33", "5")

    res = api.get(URL)
    assert res.status_code == 200, res.data
    assert res.data["lots"] == 1
    assert res.data["open_lots"] == 0
    assert Decimal(res.data["cherry_input_kg"]) == Decimal("355")
    assert Decimal(res.data["actual_kg"]) == Decimal("38")
    a1 = next(g for g in res.data["by_grade"] if g["code"] == "A1")
    assert Decimal(a1["actual_kg"]) == Decimal("33")
    assert res.data["by_station"] == [{"label": "Gitoki CWS", "kg": Decimal("355.00")}]
    assert res.data["by_process"] == [{"label": "Fully Washed", "kg": Decimal("355.00")}]


def test_open_lot_is_not_counted_as_closed(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_process(api, gitoki, "FW")
    new_lot(api, process, "100")

    res = api.get(URL)
    assert res.data["lots"] == 1
    assert res.data["open_lots"] == 1
    assert res.data["actual_kg"] == 0


def test_clerk_only_sees_own_station_lots(api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi):
    login(api, gitoki_clerk)
    new_lot(api, register_process(api, gitoki, "FW"), "100")

    login(api, bugoyi_clerk)
    new_lot(api, register_process(api, bugoyi, "NN"), "60")

    res = api.get(URL)
    assert res.data["lots"] == 1
    assert Decimal(res.data["cherry_input_kg"]) == Decimal("60")
    assert res.data["by_station"] == [{"label": "Bugoyi CWS", "kg": Decimal("60.00")}]


def test_admin_sees_every_station_and_process(
    api, hq_finance, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi
):
    login(api, gitoki_clerk)
    new_lot(api, register_process(api, gitoki, "FW"), "100")
    login(api, bugoyi_clerk)
    new_lot(api, register_process(api, bugoyi, "NN"), "60")

    login(api, hq_finance)
    res = api.get(URL)
    assert res.data["lots"] == 2
    assert Decimal(res.data["cherry_input_kg"]) == Decimal("160")
    assert {row["label"] for row in res.data["by_station"]} == {"Gitoki CWS", "Bugoyi CWS"}
    assert {row["label"] for row in res.data["by_process"]} == {"Fully Washed", "Normal Natural"}


def test_cws_stock_shows_processed_vs_delivered_to_dry_mill(api, gitoki_clerk, gitoki, hq):
    """Sorted at the station (actual kg) minus what's already reached HQ dry mill
    (parchment stock receipts sourced from that station) = still at the station."""
    login(api, gitoki_clerk)
    process = register_process(api, gitoki, "FW")
    lot = new_lot(api, process, "355")
    record_actuals(api, lot, process, "33", "5")  # A1=33kg, A2=5kg sorted

    stock_receipt(gitoki, net="20", bags="0")  # 20kg of A1 delivered to HQ dry mill

    res = api.get(URL)
    assert res.status_code == 200, res.data
    row = next(r for r in res.data["cws_stock"] if r["grade"] == "A1")
    assert row["facility_name"] == "Gitoki CWS"
    assert row["process_name"] == "Fully Washed"
    assert Decimal(row["processed_kg"]) == Decimal("33")
    assert Decimal(row["delivered_kg"]) == Decimal("20")
    assert Decimal(row["balance_kg"]) == Decimal("13")

    # A2 was sorted but nothing has been delivered yet - still fully at the station.
    a2 = next(r for r in res.data["cws_stock"] if r["grade"] == "A2")
    assert Decimal(a2["processed_kg"]) == Decimal("5")
    assert Decimal(a2["delivered_kg"]) == Decimal("0")
    assert Decimal(a2["balance_kg"]) == Decimal("5")


def test_by_grade_variance_ignores_grades_awaiting_actuals(api, gitoki_clerk, gitoki):
    """Lot 1 (355 kg): A1 est 49.70 -> 45 actual, A2 est 14.20 -> 15 actual.
    Lot 2 (100 kg) has no actuals: its estimates must not count as a loss."""
    login(api, gitoki_clerk)
    process = register_process(api, gitoki, "FW")
    lot = new_lot(api, process, "355")
    record_actuals(api, lot, process, "45", "15")
    new_lot(api, process, "100")

    res = api.get(URL)
    a1 = next(g for g in res.data["by_grade"] if g["code"] == "A1")
    assert Decimal(a1["estimated_kg"]) == Decimal("63.70")  # 49.70 + 14.00
    assert Decimal(a1["compared_estimated_kg"]) == Decimal("49.70")
    assert Decimal(a1["variance_kg"]) == Decimal("-4.70")
    assert Decimal(a1["variance_pct"]) == Decimal("-9.46")
    a2 = next(g for g in res.data["by_grade"] if g["code"] == "A2")
    assert Decimal(a2["variance_kg"]) == Decimal("0.80")
    assert Decimal(a2["variance_pct"]) == Decimal("5.63")
    assert Decimal(res.data["compared_estimated_kg"]) == Decimal("63.90")
    assert Decimal(res.data["variance_kg"]) == Decimal("-3.90")
    assert Decimal(res.data["variance_pct"]) == Decimal("-6.10")


def _two_station_lots(api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi):
    login(api, gitoki_clerk)
    new_lot(api, register_process(api, gitoki, "FW"), "100")
    login(api, bugoyi_clerk)
    new_lot(api, register_process(api, bugoyi, "NN"), "60")


def test_report_filters_by_station_and_process(
    api, hq_finance, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi
):
    _two_station_lots(api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi)
    login(api, hq_finance)

    res = api.get(URL, {"station": str(gitoki.id)})
    assert res.status_code == 200, res.data
    assert res.data["lots"] == 1
    assert Decimal(res.data["cherry_input_kg"]) == Decimal("100")
    assert [r["label"] for r in res.data["by_station"]] == ["Gitoki CWS"]

    res = api.get(URL, {"process": str(Process.objects.get(code="NN").id)})
    assert res.data["lots"] == 1
    assert Decimal(res.data["cherry_input_kg"]) == Decimal("60")
    assert [r["label"] for r in res.data["by_process"]] == ["Normal Natural"]

    res = api.get(
        URL, {"station": str(gitoki.id), "process": str(Process.objects.get(code="NN").id)}
    )
    assert res.data["lots"] == 0

    assert api.get(URL, {"station": "not-a-uuid"}).status_code == 400


def test_report_filters_by_sub_process_including_cws_stock(api, hq_finance, gitoki_clerk, gitoki):
    fw = Process.objects.get(code="FW")
    sub = SubProcess.objects.create(process=fw, name="WASHED NO 1")
    login(api, gitoki_clerk)
    plain = register_process(api, gitoki, "FW")
    lot = new_lot(api, plain, "100")
    record_actuals(api, lot, plain, "10", "2")
    with_sub = api.post(
        PROCESSES,
        {
            "facility": str(gitoki.id),
            "process": str(fw.id),
            "sub_process": str(sub.id),
            "grades": FW_GRADES,
        },
        format="json",
    ).data
    lot = new_lot(api, with_sub, "40")
    record_actuals(api, lot, with_sub, "6", "1")

    login(api, hq_finance)
    res = api.get(URL, {"process": str(fw.id), "sub_process": str(sub.id)})
    assert res.data["lots"] == 1
    assert Decimal(res.data["cherry_input_kg"]) == Decimal("40")
    assert Decimal(res.data["actual_kg"]) == Decimal("7")
    assert {r["sub_process_name"] for r in res.data["cws_stock"]} == {"WASHED NO 1"}

    res = api.get(URL, {"process": str(fw.id)})
    assert res.data["lots"] == 2


def test_clerk_cannot_see_another_station_through_the_station_filter(
    api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi, hq
):
    _two_station_lots(api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi)
    stock_receipt(gitoki, net="20", bags="0")

    login(api, bugoyi_clerk)
    res = api.get(URL, {"station": str(gitoki.id)})
    assert res.status_code == 200, res.data
    assert res.data["lots"] == 0
    assert res.data["cherry_input_kg"] == 0
    assert res.data["by_station"] == []
    assert res.data["cws_stock"] == []
