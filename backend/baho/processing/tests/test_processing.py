from datetime import date
from decimal import Decimal

import pytest

from tests.helpers import login

pytestmark = pytest.mark.django_db
PROCESSES = "/api/v1/processing/process-types/"
LOTS = "/api/v1/processing/lots/"

FW_GRADES = [
    {"code": "A1", "ratio": "0.14"},
    {"code": "A2", "ratio": "0.04"},
    {"code": "A3", "ratio": "0.025"},
    {"code": "HPC", "name": "HPC/A4", "ratio": "0.015"},
]


def register_fw(api, facility):
    return api.post(
        PROCESSES,
        {
            "facility": str(facility.id),
            "name": "Fully Washed",
            "sub_process": "Standard Run",
            "grades": FW_GRADES,
        },
        format="json",
    )


def test_register_process_with_ratios(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = register_fw(api, gitoki)
    assert res.status_code == 201, res.data
    assert [g["code"] for g in res.data["grades"]] == ["A1", "A2", "A3", "HPC"]
    assert Decimal(res.data["total_ratio"]) == Decimal("0.22")


def test_duplicate_process_is_rejected(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    register_fw(api, gitoki)
    assert register_fw(api, gitoki).status_code == 400


def test_ratios_over_100_percent_are_rejected(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = api.post(
        PROCESSES,
        {
            "facility": str(gitoki.id),
            "name": "Bad",
            "grades": [{"code": "A1", "ratio": "0.7"}, {"code": "A2", "ratio": "0.5"}],
        },
        format="json",
    )
    assert res.status_code == 400


def test_lot_estimates_match_real_gitoki_workbook(api, gitoki_clerk, gitoki):
    """Lot 1 of the Gitoki FW sheet: 355 kg cherry -> A1 49.70, A2 14.20, A3 8.88, HPC 5.33."""
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    res = api.post(LOTS, {"process_type": process["id"], "cherry_input_kg": "355"}, format="json")
    assert res.status_code == 201, res.data
    estimates = {r["grade_code"]: Decimal(r["estimated_kg"]) for r in res.data["results"]}
    assert estimates == {
        "A1": Decimal("49.70"),
        "A2": Decimal("14.20"),
        "A3": Decimal("8.88"),
        "HPC": Decimal("5.33"),
    }
    assert res.data["lot_number"] == f"GITOKI-{date.today().year}-L0001"
    assert res.data["status"] == "IN_PROGRESS"


def test_recording_all_actuals_marks_lot_sorted(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    lot = api.post(
        LOTS, {"process_type": process["id"], "cherry_input_kg": "355"}, format="json"
    ).data
    actuals = [
        {"grade": g["id"], "actual_kg": kg}
        for g, kg in zip(process["grades"], ["33", "5", "3", "7"], strict=True)
    ]
    res = api.post(f"{LOTS}{lot['id']}/actuals/", {"actuals": actuals}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["status"] == "SORTED"
    # 48 kg sorted from 355 kg cherry = 13.521% (the workbook's "Ov.All" column)
    assert Decimal(res.data["total_outturn_pct"]) == Decimal("13.521")


def test_custom_lot_number_must_be_unique(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    body = {"process_type": process["id"], "cherry_input_kg": "100", "lot_number": "GTK-FW-014"}
    assert api.post(LOTS, body, format="json").status_code == 201
    assert api.post(LOTS, body, format="json").status_code == 400


def test_other_station_cannot_create_lot_on_my_process(api, gitoki_clerk, bugoyi_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    login(api, bugoyi_clerk)
    res = api.post(LOTS, {"process_type": process["id"], "cherry_input_kg": "100"}, format="json")
    assert res.status_code == 403
    assert api.get(PROCESSES).data == []
