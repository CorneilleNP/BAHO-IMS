from decimal import Decimal

import pytest

from baho.processing.models import Process
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
