from datetime import date
from decimal import Decimal

import pytest

from baho.processing.models import Process
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
    # Grades are shared per catalogue process, not typed per station.
    fw = Process.objects.get(code="FW")
    return api.post(
        PROCESSES,
        {"facility": str(facility.id), "process": str(fw.id), "grades": FW_GRADES},
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
            "process": str(Process.objects.get(code="NN").id),
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


def test_estimate_ratios_can_be_corrected(api, gitoki_clerk, gitoki):
    """Grades are shared per catalogue process, so correcting A1's ratio here is
    visible to every station on Fully Washed; A3/HPC (not in this PATCH) are
    untouched, since nothing resets or removes an existing shared grade."""
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    res = api.patch(
        f"{PROCESSES}{process['id']}/",
        {"grades": [{"code": "A1", "ratio": "0.20"}, {"code": "A2", "ratio": "0.04"}]},
        format="json",
    )
    assert res.status_code == 200, res.data
    assert {g["code"] for g in res.data["grades"]} == {"A1", "A2", "A3", "HPC"}
    a1 = next(g for g in res.data["grades"] if g["code"] == "A1")
    assert Decimal(a1["ratio"]) == Decimal("0.20")
    # 0.20 + 0.04 (unchanged) + 0.025 + 0.015 (both untouched by this PATCH)
    assert Decimal(res.data["total_ratio"]) == Decimal("0.28")


def test_process_can_be_moved_and_deactivated(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    nn = Process.objects.get(code="NN")
    res = api.patch(
        f"{PROCESSES}{process['id']}/", {"process": str(nn.id), "is_active": False}, format="json"
    )
    assert res.status_code == 200, res.data
    assert res.data["process_name"] == "Normal Natural"
    assert res.data["is_active"] is False


def test_moving_onto_an_existing_registration_is_rejected(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    fw = register_fw(api, gitoki).data
    nn = Process.objects.get(code="NN")
    res = api.post(
        PROCESSES,
        {"facility": str(gitoki.id), "process": str(nn.id), "grades": FW_GRADES},
        format="json",
    )
    assert res.status_code == 201, res.data
    res = api.patch(f"{PROCESSES}{fw['id']}/", {"process": str(nn.id)}, format="json")
    assert res.status_code == 400


def test_other_station_cannot_correct_my_process(api, gitoki_clerk, bugoyi_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    login(api, bugoyi_clerk)
    res = api.patch(f"{PROCESSES}{process['id']}/", {"is_active": False}, format="json")
    assert res.status_code in (403, 404)


def test_lot_shows_estimate_vs_actual_variance_per_grade(api, gitoki_clerk, gitoki):
    """355 kg cherry -> estimates A1 49.70, A2 14.20. Actual A1 52.20 is a gain of
    2.50 kg (+5.03%), A2 12.00 a loss of 2.20 kg (-15.49%). A3/HPC have no actual
    yet, so they show no variance and stay out of the lot total."""
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    lot = api.post(
        LOTS, {"process_type": process["id"], "cherry_input_kg": "355"}, format="json"
    ).data
    grades = {g["code"]: g["id"] for g in process["grades"]}
    actuals = {"A1": "52.20", "A2": "12", "A3": None, "HPC": None}
    res = api.post(
        f"{LOTS}{lot['id']}/actuals/",
        {"actuals": [{"grade": grades[c], "actual_kg": v} for c, v in actuals.items()]},
        format="json",
    )
    assert res.status_code == 200, res.data

    rows = {r["grade_code"]: r for r in api.get(f"{LOTS}{lot['id']}/").data["results"]}
    assert Decimal(rows["A1"]["variance_kg"]) == Decimal("2.50")
    assert Decimal(rows["A1"]["variance_pct"]) == Decimal("5.03")
    assert Decimal(rows["A2"]["variance_kg"]) == Decimal("-2.20")
    assert Decimal(rows["A2"]["variance_pct"]) == Decimal("-15.49")
    assert rows["A3"]["variance_kg"] is None
    assert rows["HPC"]["variance_pct"] is None

    total = res.data["variance"]
    assert Decimal(total["compared_estimated_kg"]) == Decimal("63.90")
    assert Decimal(total["variance_kg"]) == Decimal("0.30")
    assert Decimal(total["variance_pct"]) == Decimal("0.47")


def test_lot_without_actuals_has_no_variance(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    process = register_fw(api, gitoki).data
    res = api.post(LOTS, {"process_type": process["id"], "cherry_input_kg": "100"}, format="json")
    assert res.data["variance"] == {
        "compared_estimated_kg": None,
        "variance_kg": None,
        "variance_pct": None,
    }
    assert all(r["variance_kg"] is None for r in res.data["results"])


def _lot_with_a1_actual(api, user, facility):
    login(api, user)
    process = register_fw(api, facility).data
    lot = api.post(LOTS, {"process_type": process["id"], "cherry_input_kg": "355"}, format="json")
    grades = {g["code"]: g["id"] for g in process["grades"]}
    res = api.post(
        f"{LOTS}{lot.data['id']}/actuals/",
        {"actuals": [{"grade": grades["A1"], "actual_kg": "50"}]},
        format="json",
    )
    assert res.status_code == 200, res.data
    return lot.data["id"], grades


@pytest.mark.parametrize("role", ["CWS_MANAGER", "CWS_CLERK"])
def test_station_staff_cannot_change_saved_actuals(api, gitoki, role):
    from tests.factories import UserFactory, assign

    user = UserFactory(email=f"{role.lower()}@test.local")
    assign(user, role, gitoki)
    lot_id, grades = _lot_with_a1_actual(api, user, gitoki)
    url = f"{LOTS}{lot_id}/actuals/"

    changed = api.post(
        url, {"actuals": [{"grade": grades["A1"], "actual_kg": "55"}]}, format="json"
    )
    assert changed.status_code == 403
    assert "administrator" in str(changed.data["detail"])
    cleared = api.post(
        url, {"actuals": [{"grade": grades["A1"], "actual_kg": None}]}, format="json"
    )
    assert cleared.status_code == 403

    # Re-sending the saved value unchanged and filling a missing grade is fine.
    res = api.post(
        url,
        {
            "actuals": [
                {"grade": grades["A1"], "actual_kg": "50.00"},
                {"grade": grades["A2"], "actual_kg": "12"},
            ]
        },
        format="json",
    )
    assert res.status_code == 200, res.data
    rows = {r["grade_code"]: r for r in res.data["results"]}
    assert Decimal(rows["A1"]["actual_kg"]) == Decimal("50")
    assert Decimal(rows["A2"]["actual_kg"]) == Decimal("12")


def test_admin_can_correct_saved_actuals(api, gitoki_clerk, baho_admin, gitoki):
    lot_id, grades = _lot_with_a1_actual(api, gitoki_clerk, gitoki)
    login(api, baho_admin)
    res = api.post(
        f"{LOTS}{lot_id}/actuals/",
        {"actuals": [{"grade": grades["A1"], "actual_kg": "55"}]},
        format="json",
    )
    assert res.status_code == 200, res.data
    rows = {r["grade_code"]: r for r in res.data["results"]}
    assert Decimal(rows["A1"]["actual_kg"]) == Decimal("55")
