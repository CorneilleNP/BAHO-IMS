from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from baho.labor.models import CasualLaborer, LaborAttendance, LaborPayPeriod
from tests.factories import UserFactory, assign
from tests.helpers import login

pytestmark = pytest.mark.django_db

LABORERS = "/api/v1/labor/laborers/"
PERIODS = "/api/v1/labor/pay-periods/"

TODAY = timezone.localdate()
START = TODAY - timedelta(days=13)
END = TODAY


def iso(day):
    return day.isoformat()


@pytest.fixture
def gitoki_manager(gitoki):
    user = UserFactory(email="manager@test.local")
    assign(user, "CWS_MANAGER", gitoki)
    return user


def make_laborer(facility, name, rate="2000", **extra):
    return CasualLaborer.objects.create(
        facility=facility, full_name=name, daily_rate=Decimal(rate), **extra
    )


@pytest.fixture
def crew(gitoki):
    return {
        "alice": make_laborer(gitoki, "Alice", "2000"),
        "bob": make_laborer(gitoki, "Bob", "1500"),
    }


def open_period(api, facility, start=START, end=END):
    res = api.post(
        PERIODS,
        {"facility": str(facility.id), "period_start": iso(start), "period_end": iso(end)},
        format="json",
    )
    return res


def roll_call(api, period_id, day, laborers, overrides=None):
    body = {"work_date": iso(day), "present_laborers": [str(lab.id) for lab in laborers]}
    if overrides is not None:
        body["daily_rate_overrides"] = {str(k.id): v for k, v in overrides.items()}
    return api.post(f"{PERIODS}{period_id}/attendance/", body, format="json")


# --- Laborers --------------------------------------------------------------


def test_clerk_registers_and_deactivates_laborer(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = api.post(
        LABORERS,
        {"facility": str(gitoki.id), "full_name": "Claude", "daily_rate": "1800"},
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["is_active"] is True
    assert Decimal(res.data["daily_rate"]) == Decimal("1800")

    upd = api.patch(f"{LABORERS}{res.data['id']}/", {"is_active": False}, format="json")
    assert upd.status_code == 200, upd.data
    assert upd.data["is_active"] is False
    assert api.delete(f"{LABORERS}{res.data['id']}/").status_code == 405


def test_laborer_duplicate_national_id_rejected(api, gitoki_clerk, gitoki):
    make_laborer(gitoki, "Alice", national_id="1199")
    login(api, gitoki_clerk)
    res = api.post(
        LABORERS,
        {
            "facility": str(gitoki.id),
            "full_name": "Other",
            "national_id": "1199",
            "daily_rate": "1",
        },
        format="json",
    )
    assert res.status_code == 400
    assert "national_id" in res.data


def test_laborer_cannot_move_station(api, gitoki_clerk, gitoki, bugoyi, crew):
    login(api, gitoki_clerk)
    res = api.patch(f"{LABORERS}{crew['alice'].id}/", {"facility": str(bugoyi.id)}, format="json")
    assert res.status_code == 400


def test_laborers_are_facility_scoped(api, bugoyi_clerk, gitoki, bugoyi, crew):
    make_laborer(bugoyi, "Bugoyi worker")
    login(api, bugoyi_clerk)
    res = api.get(LABORERS)
    assert res.status_code == 200
    assert [row["full_name"] for row in res.data["results"]] == ["Bugoyi worker"]
    assert api.get(f"{LABORERS}{crew['alice'].id}/").status_code == 404

    res = api.post(
        LABORERS,
        {"facility": str(gitoki.id), "full_name": "Sneaky", "daily_rate": "100"},
        format="json",
    )
    assert res.status_code == 403


def test_hq_finance_reads_but_cannot_write_laborers(api, hq_finance, gitoki, crew):
    login(api, hq_finance)
    assert api.get(LABORERS).data["count"] == 2
    res = api.post(
        LABORERS, {"facility": str(gitoki.id), "full_name": "X", "daily_rate": "1"}, format="json"
    )
    assert res.status_code == 403


def test_laborer_only_at_cws(api, baho_admin, hq):
    login(api, baho_admin)
    res = api.post(
        LABORERS, {"facility": str(hq.id), "full_name": "X", "daily_rate": "1"}, format="json"
    )
    assert res.status_code == 400


# --- Pay periods -----------------------------------------------------------


def test_open_period_and_reject_overlap(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    res = open_period(api, gitoki)
    assert res.status_code == 201, res.data
    assert res.data["status"] == "OPEN"
    assert res.data["summary"]["laborers"] == []
    assert Decimal(res.data["total_amount"]) == 0

    overlap = open_period(api, gitoki, START + timedelta(days=5), END + timedelta(days=5))
    assert overlap.status_code == 400

    after = open_period(api, gitoki, END + timedelta(days=1), END + timedelta(days=7))
    assert after.status_code == 201, after.data


def test_period_end_before_start_rejected(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    assert open_period(api, gitoki, END, START).status_code == 400


def test_other_facility_may_overlap(api, baho_admin, gitoki, bugoyi):
    login(api, baho_admin)
    assert open_period(api, gitoki).status_code == 201
    assert open_period(api, bugoyi).status_code == 201


def test_voided_period_frees_its_days(api, gitoki_clerk, gitoki, crew):
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    assert roll_call(api, period["id"], TODAY, [crew["alice"]]).status_code == 200
    res = api.post(f"{PERIODS}{period['id']}/void/", {"reason": "Wrong dates"}, format="json")
    assert res.status_code == 200, res.data
    assert api.get(f"{PERIODS}{period['id']}/").status_code == 404

    again = open_period(api, gitoki).data
    assert roll_call(api, again["id"], TODAY, [crew["alice"]]).status_code == 200
    assert LaborAttendance.all_objects.filter(laborer=crew["alice"]).count() == 2
    assert LaborAttendance.objects.filter(laborer=crew["alice"]).count() == 1


# --- Attendance --------------------------------------------------------------


def test_attendance_summary_totals(api, gitoki_clerk, gitoki, crew):
    alice, bob = crew["alice"], crew["bob"]
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    assert roll_call(api, period["id"], START, [alice, bob]).status_code == 200
    assert roll_call(api, period["id"], START + timedelta(days=1), [alice]).status_code == 200
    res = roll_call(api, period["id"], START + timedelta(days=2), [alice, bob], {bob: "1800"})
    assert res.status_code == 200, res.data

    summary = res.data["summary"]
    by_name = {row["full_name"]: row for row in summary["laborers"]}
    assert by_name["Alice"]["days_present"] == 3
    assert Decimal(by_name["Alice"]["total_amount"]) == Decimal("6000")
    assert by_name["Bob"]["days_present"] == 2
    assert Decimal(by_name["Bob"]["total_amount"]) == Decimal("3300")
    assert summary["days_present"] == 5
    assert summary["laborer_count"] == 2
    assert Decimal(summary["total_amount"]) == Decimal("9300")
    assert Decimal(res.data["total_amount"]) == Decimal("9300")

    listing = api.get(PERIODS).data["results"]
    assert Decimal(listing[0]["total_amount"]) == Decimal("9300")
    assert listing[0]["days_present"] == 5

    day = api.get(f"{PERIODS}{period['id']}/attendance/", {"work_date": iso(START)})
    assert day.status_code == 200
    assert len(day.data) == 2


def test_rate_defaults_to_laborer_rate_at_time_of_recording(api, gitoki_clerk, gitoki, crew):
    alice = crew["alice"]
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    roll_call(api, period["id"], START, [alice])
    api.patch(f"{LABORERS}{alice.id}/", {"daily_rate": "2500"}, format="json")
    res = roll_call(api, period["id"], START + timedelta(days=1), [alice])
    assert Decimal(res.data["summary"]["total_amount"]) == Decimal("4500")


def test_resending_a_day_updates_instead_of_duplicating(api, gitoki_clerk, gitoki, crew):
    alice, bob = crew["alice"], crew["bob"]
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    roll_call(api, period["id"], TODAY, [alice, bob])
    res = roll_call(api, period["id"], TODAY, [alice])
    assert res.status_code == 200, res.data

    rows = LaborAttendance.objects.filter(work_date=TODAY)
    assert rows.count() == 2
    assert rows.get(laborer=bob).present is False
    assert res.data["summary"]["days_present"] == 1
    assert Decimal(res.data["summary"]["total_amount"]) == Decimal("2000")

    res = roll_call(api, period["id"], TODAY, [alice, bob])
    assert rows.count() == 2
    assert res.data["summary"]["days_present"] == 2


def test_attendance_outside_period_rejected(api, gitoki_clerk, gitoki, crew):
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    res = roll_call(api, period["id"], START - timedelta(days=1), [crew["alice"]])
    assert res.status_code == 400
    assert "work_date" in res.data


def test_attendance_in_future_rejected(api, gitoki_clerk, gitoki, crew):
    login(api, gitoki_clerk)
    period = open_period(api, gitoki, START, TODAY + timedelta(days=3)).data
    res = roll_call(api, period["id"], TODAY + timedelta(days=1), [crew["alice"]])
    assert res.status_code == 400


def test_attendance_wrong_facility_laborer_rejected(api, baho_admin, gitoki, bugoyi, crew):
    outsider = make_laborer(bugoyi, "Outsider")
    login(api, baho_admin)
    period = open_period(api, gitoki).data
    res = roll_call(api, period["id"], TODAY, [crew["alice"], outsider])
    assert res.status_code == 400
    assert "present_laborers" in res.data
    assert not LaborAttendance.objects.exists()


def test_attendance_inactive_laborer_rejected(api, gitoki_clerk, gitoki):
    retired = make_laborer(gitoki, "Retired", is_active=False)
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    assert roll_call(api, period["id"], TODAY, [retired]).status_code == 400


def test_attendance_frozen_once_closed(api, gitoki_manager, gitoki, crew):
    login(api, gitoki_manager)
    period = open_period(api, gitoki).data
    roll_call(api, period["id"], TODAY, [crew["alice"]])
    assert api.post(f"{PERIODS}{period['id']}/close/").status_code == 200
    res = roll_call(api, period["id"], TODAY, [crew["bob"]])
    assert res.status_code == 400
    assert LaborAttendance.objects.get(laborer=crew["alice"]).present is True
    void = api.post(f"{PERIODS}{period['id']}/void/", {"reason": "Oops"}, format="json")
    assert void.status_code == 400


def test_bugoyi_clerk_cannot_touch_gitoki_period(api, gitoki_clerk, bugoyi_clerk, gitoki, crew):
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    login(api, bugoyi_clerk)
    assert api.get(PERIODS).data["count"] == 0
    assert api.get(f"{PERIODS}{period['id']}/").status_code == 404
    assert roll_call(api, period["id"], TODAY, [crew["alice"]]).status_code == 404
    assert (
        open_period(api, gitoki, END + timedelta(days=1), END + timedelta(days=2)).status_code
        == 403
    )


# --- Status transitions and roles ---------------------------------------------


def test_status_flow_open_closed_paid(api, gitoki_manager, gitoki, crew):
    login(api, gitoki_manager)
    period = open_period(api, gitoki).data
    url = f"{PERIODS}{period['id']}"

    assert api.post(f"{url}/mark-paid/").status_code == 400  # still open
    res = api.post(f"{url}/close/")
    assert res.status_code == 200, res.data
    assert res.data["status"] == "CLOSED"
    assert res.data["closed_by"] == gitoki_manager.id
    assert api.post(f"{url}/close/").status_code == 400  # already closed

    res = api.post(f"{url}/mark-paid/")
    assert res.status_code == 200, res.data
    assert res.data["status"] == "PAID"
    assert res.data["paid_at"] is not None
    assert api.post(f"{url}/mark-paid/").status_code == 400


def test_clerk_cannot_close_or_mark_paid(api, gitoki_clerk, gitoki):
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    assert api.post(f"{PERIODS}{period['id']}/close/").status_code == 403
    LaborPayPeriod.objects.filter(pk=period["id"]).update(status=LaborPayPeriod.Status.CLOSED)
    assert api.post(f"{PERIODS}{period['id']}/mark-paid/").status_code == 403


def test_hq_finance_marks_paid_but_cannot_close(api, gitoki_manager, hq_finance, gitoki):
    login(api, gitoki_manager)
    period = open_period(api, gitoki).data
    login(api, hq_finance)
    assert api.post(f"{PERIODS}{period['id']}/close/").status_code == 403
    login(api, gitoki_manager)
    assert api.post(f"{PERIODS}{period['id']}/close/").status_code == 200
    login(api, hq_finance)
    res = api.post(f"{PERIODS}{period['id']}/mark-paid/")
    assert res.status_code == 200, res.data
    assert res.data["status"] == "PAID"


def test_admin_can_close_and_pay(api, baho_admin, gitoki):
    login(api, baho_admin)
    period = open_period(api, gitoki).data
    assert api.post(f"{PERIODS}{period['id']}/close/").status_code == 200
    assert api.post(f"{PERIODS}{period['id']}/mark-paid/").status_code == 200


def test_manager_of_other_station_cannot_close(api, gitoki_clerk, bugoyi, gitoki):
    other = UserFactory(email="manager.bugoyi@test.local")
    assign(other, "CWS_MANAGER", bugoyi)
    login(api, gitoki_clerk)
    period = open_period(api, gitoki).data
    login(api, other)
    assert api.post(f"{PERIODS}{period['id']}/close/").status_code == 404
