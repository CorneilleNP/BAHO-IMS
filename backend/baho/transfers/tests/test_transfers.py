from decimal import Decimal

import pytest

from baho.drymill.models import HqStockReceipt
from baho.processing.models import Process, ProcessGrade
from baho.processing.services import register_process
from tests.helpers import login

pytestmark = pytest.mark.django_db

CWS = "/api/v1/transfers/cws/"
DM = "/api/v1/transfers/dry-mill/"
SUMMARY = "/api/v1/reporting/transfers/"


@pytest.fixture
def grades(gitoki, gitoki_clerk):
    register_process(
        user=gitoki_clerk,
        facility=gitoki,
        process=Process.objects.get(code="FW"),
        grades=[{"code": "A1", "ratio": Decimal("0.14")}, {"code": "A2", "ratio": Decimal("0.04")}],
    )
    return {
        "a1": ProcessGrade.objects.get(process__code="FW", code="A1"),
        "a2": ProcessGrade.objects.get(process__code="FW", code="A2"),
    }


def one_line(grade, weighings=None, weight_of_bags_kg="20"):
    return {
        "process": str(grade.process_id),
        "grade": str(grade.id),
        "moisture_content_pct": "12.5",
        "weighings": weighings or [{"bags": 10, "weight_kg": "100"}, {"bags": 10, "weight_kg": "300"}],
        "weight_of_bags_kg": weight_of_bags_kg,
    }


def new_transfer_body(gitoki, lines, note_no="DN-001", **extra):
    return {
        "facility": str(gitoki.id),
        "transfer_date": "2026-01-10",
        "delivery_note_no": note_no,
        "lines": lines,
        **extra,
    }


def create_and_submit(api, gitoki, lines, note_no="DN-001"):
    res = api.post(CWS, new_transfer_body(gitoki, lines, note_no), format="json")
    assert res.status_code == 201, res.data
    sub = api.post(f"{CWS}{res.data['id']}/submit/")
    assert sub.status_code == 200, sub.data
    return sub.data


def _weigh_line(api, receipt_id, line_id, weight_kg, bags=20, weight_of_bags_kg="20"):
    return api.patch(
        f"{DM}{receipt_id}/lines/{line_id}/",
        {"weighings": [{"bags": bags, "weight_kg": weight_kg}], "weight_of_bags_kg": weight_of_bags_kg},
        format="json",
    )


def _lock(api, receipt_id):
    return api.post(f"{DM}{receipt_id}/lock/")


def _submit(api, receipt_id, comment=None):
    body = {"comment": comment} if comment is not None else {}
    return api.post(f"{DM}{receipt_id}/submit/", body, format="json")


def test_transfer_sums_weighings_and_computes_net(api, gitoki_clerk, gitoki, grades):
    login(api, gitoki_clerk)
    res = api.post(CWS, new_transfer_body(gitoki, [one_line(grades["a1"])]), format="json")
    assert res.status_code == 201, res.data
    line = res.data["lines"][0]
    assert line["number_of_bags"] == 20
    assert Decimal(line["gross_weight_kg"]) == Decimal("400")
    assert Decimal(line["net_weight_kg"]) == Decimal("380")
    assert res.data["status"] == "DRAFT"


def test_transfer_can_carry_several_grades_in_one_delivery(api, gitoki_clerk, gitoki, grades):
    login(api, gitoki_clerk)
    res = api.post(
        CWS,
        new_transfer_body(
            gitoki,
            [
                one_line(grades["a1"], weighings=[{"bags": 10, "weight_kg": "300"}], weight_of_bags_kg="10"),
                one_line(grades["a2"], weighings=[{"bags": 5, "weight_kg": "120"}], weight_of_bags_kg="5"),
            ],
        ),
        format="json",
    )
    assert res.status_code == 201, res.data
    assert len(res.data["lines"]) == 2
    codes = {line["grade_code"] for line in res.data["lines"]}
    assert codes == {"A1", "A2"}


def test_duplicate_grade_on_one_delivery_is_rejected(api, gitoki_clerk, gitoki, grades):
    login(api, gitoki_clerk)
    res = api.post(
        CWS,
        new_transfer_body(gitoki, [one_line(grades["a1"]), one_line(grades["a1"])]),
        format="json",
    )
    assert res.status_code == 400


def test_submitted_transfer_cannot_be_edited(api, gitoki_clerk, gitoki, grades):
    login(api, gitoki_clerk)
    data = create_and_submit(api, gitoki, [one_line(grades["a1"])])
    res = api.patch(f"{CWS}{data['id']}/", {"notes": "oops"}, format="json")
    assert res.status_code == 400


def test_dry_mill_cannot_look_up_an_unsubmitted_transfer(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    draft = api.post(CWS, new_transfer_body(gitoki, [one_line(grades["a1"])]), format="json").data

    login(api, drymill_operator)
    res = api.get(f"{DM}lookup/", {"delivery_note_no": draft["delivery_note_no"]})
    assert res.status_code == 400


def test_dry_mill_lookup_hides_cws_numbers_until_locked(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])

    login(api, drymill_operator)
    res = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"})
    assert res.status_code == 200, res.data
    assert res.data["status"] == "PENDING"
    assert len(res.data["lines"]) == 1
    line = res.data["lines"][0]
    cws_line = line["cws_line"]
    assert cws_line["process_name"] == "Fully Washed"
    assert cws_line["grade_code"] == "A1"
    assert "gross_weight_kg" not in cws_line
    assert "net_weight_kg" not in cws_line
    assert "weighings" not in cws_line
    assert line["variance"] is None
    assert line["variance_kg"] is None


def test_lock_reveals_per_field_variance_before_any_comment(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])  # CWS: bags 20, gross 400, bags_kg 20, net 380

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    receipt_id, line_id = lookup["id"], lookup["lines"][0]["id"]
    _weigh_line(api, receipt_id, line_id, "390", bags=19, weight_of_bags_kg="19")  # ours: bags 19, gross 390, bags_kg 19, net 371

    locked = _lock(api, receipt_id)
    assert locked.status_code == 200, locked.data
    assert locked.data["status"] == "LOCKED"
    line = locked.data["lines"][0]
    # The station's own figures and a field-by-field breakdown are now visible, with no comment yet.
    assert line["cws_line"]["gross_weight_kg"] is not None
    assert line["variance"] == {
        "number_of_bags": 1,
        "gross_weight_kg": "10.00",
        "weight_of_bags_kg": "1.00",
        "net_weight_kg": "9.00",
    }
    assert line["variance_status"] == "STOCK_LOSS"
    assert locked.data["comment"] == ""
    assert locked.data["confirmed_at"] is None


def test_cannot_edit_weighing_once_locked(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    receipt_id, line_id = lookup["id"], lookup["lines"][0]["id"]
    _weigh_line(api, receipt_id, line_id, "400")
    _lock(api, receipt_id)

    blocked = _weigh_line(api, receipt_id, line_id, "410")
    assert blocked.status_code == 403


def test_submit_without_locking_first_is_rejected(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    _weigh_line(api, lookup["id"], lookup["lines"][0]["id"], "400")

    res = _submit(api, lookup["id"])
    assert res.status_code == 400


def test_submit_match_needs_no_comment_and_creates_stock(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])  # CWS: gross 400, bags 20 -> net 380

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    receipt_id, line_id = lookup["id"], lookup["lines"][0]["id"]
    _weigh_line(api, receipt_id, line_id, "400")
    _lock(api, receipt_id)

    submit = _submit(api, receipt_id)
    assert submit.status_code == 200, submit.data
    line = submit.data["lines"][0]
    assert line["variance_status"] == "MATCH"
    assert Decimal(line["variance_kg"]) == Decimal("0")

    stock_number = line["stock_receipt_number"]
    receipt = HqStockReceipt.objects.get(receipt_number=stock_number)
    assert receipt.pure_weight_kg == Decimal("380")
    assert receipt.source_facility_id == gitoki.id


def test_submit_stock_loss_requires_a_comment(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])  # CWS net 380

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    receipt_id, line_id = lookup["id"], lookup["lines"][0]["id"]
    _weigh_line(api, receipt_id, line_id, "390")  # dry mill net 370 < CWS net 380 -> stock loss of 10
    _lock(api, receipt_id)

    no_comment = _submit(api, receipt_id)
    assert no_comment.status_code == 400

    submit = _submit(api, receipt_id, "Truck leaked on the way")
    assert submit.status_code == 200, submit.data
    line = submit.data["lines"][0]
    assert line["variance_status"] == "STOCK_LOSS"
    assert Decimal(line["variance_kg"]) == Decimal("10")
    assert submit.data["comment"] == "Truck leaked on the way"


def test_submit_stock_gain(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])  # CWS net 380

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    receipt_id, line_id = lookup["id"], lookup["lines"][0]["id"]
    _weigh_line(api, receipt_id, line_id, "420")  # dry mill net 400 > CWS net 380 -> stock gain of 20
    _lock(api, receipt_id)

    submit = _submit(api, receipt_id, "Re-weighed, scale was off at station")
    assert submit.status_code == 200, submit.data
    line = submit.data["lines"][0]
    assert line["variance_status"] == "STOCK_GAIN"
    assert Decimal(line["variance_kg"]) == Decimal("-20")


def test_multi_line_delivery_locks_and_submits_each_line_independently(api, gitoki_clerk, gitoki, grades, drymill_operator):
    login(api, gitoki_clerk)
    create_and_submit(
        api,
        gitoki,
        [
            one_line(grades["a1"], weighings=[{"bags": 10, "weight_kg": "300"}], weight_of_bags_kg="10"),  # net 290
            one_line(grades["a2"], weighings=[{"bags": 5, "weight_kg": "120"}], weight_of_bags_kg="5"),  # net 115
        ],
    )

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    assert len(lookup["lines"]) == 2
    by_grade = {line["cws_line"]["grade_code"]: line["id"] for line in lookup["lines"]}

    _weigh_line(api, lookup["id"], by_grade["A1"], "300", bags=10, weight_of_bags_kg="10")  # matches: net 290
    _weigh_line(api, lookup["id"], by_grade["A2"], "130", bags=5, weight_of_bags_kg="5")  # dry mill net 125 > 115 -> gain
    _lock(api, lookup["id"])

    submit = _submit(api, lookup["id"], "A2 bags re-weighed heavier")
    assert submit.status_code == 200, submit.data
    statuses = {line["cws_line"]["grade_code"]: line["variance_status"] for line in submit.data["lines"]}
    assert statuses == {"A1": "MATCH", "A2": "STOCK_GAIN"}


def test_confirmed_receipt_is_locked_until_admin_unlocks(
    api, gitoki_clerk, gitoki, grades, drymill_operator, baho_admin
):
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    receipt_id, line_id = lookup["id"], lookup["lines"][0]["id"]
    _weigh_line(api, receipt_id, line_id, "400")
    _lock(api, receipt_id)
    _submit(api, receipt_id)

    locked_edit = _weigh_line(api, receipt_id, line_id, "410")
    assert locked_edit.status_code == 403

    denied_unlock = api.post(f"{DM}{receipt_id}/unlock/")
    assert denied_unlock.status_code == 403

    login(api, baho_admin)
    unlock = api.post(f"{DM}{receipt_id}/unlock/")
    assert unlock.status_code == 200, unlock.data
    assert unlock.data["status"] == "PENDING"

    login(api, drymill_operator)
    edit = _weigh_line(api, receipt_id, line_id, "410")
    assert edit.status_code == 200, edit.data


def test_locked_but_not_yet_submitted_also_blocks_edits_and_needs_admin_to_unlock(
    api, gitoki_clerk, gitoki, grades, drymill_operator, baho_admin
):
    """"Confirmation" (locking) is what freezes the numbers - submitting the
    comment afterwards is a separate, later step."""
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])])

    login(api, drymill_operator)
    lookup = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-001"}).data
    receipt_id, line_id = lookup["id"], lookup["lines"][0]["id"]
    _weigh_line(api, receipt_id, line_id, "400")
    _lock(api, receipt_id)  # locked, but not yet submitted

    assert _weigh_line(api, receipt_id, line_id, "410").status_code == 403
    assert api.post(f"{DM}{receipt_id}/unlock/").status_code == 403  # not an admin

    login(api, baho_admin)
    assert api.post(f"{DM}{receipt_id}/unlock/").status_code == 200


def test_other_station_cannot_see_or_submit_my_transfer(api, gitoki_clerk, bugoyi_clerk, gitoki, grades):
    login(api, gitoki_clerk)
    mine = api.post(CWS, new_transfer_body(gitoki, [one_line(grades["a1"])]), format="json").data

    login(api, bugoyi_clerk)
    assert api.get(f"{CWS}{mine['id']}/").status_code == 404
    assert api.post(f"{CWS}{mine['id']}/submit/").status_code == 404
    assert api.post(CWS, new_transfer_body(gitoki, [one_line(grades["a1"])], note_no="DN-999"), format="json").status_code == 403


def test_dashboard_totals_and_facility_scoping(
    api, gitoki_clerk, bugoyi_clerk, gitoki, bugoyi, grades, drymill_operator
):
    login(api, bugoyi_clerk)
    register_process(
        user=bugoyi_clerk,
        facility=bugoyi,
        process=Process.objects.get(code="FW"),
        grades=[{"code": "A1", "ratio": Decimal("0.14")}],
    )
    bugoyi_grade = ProcessGrade.objects.get(process__code="FW", code="A1")
    create_and_submit(api, bugoyi, [one_line(bugoyi_grade)], note_no="DN-BUG-1")

    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a1"])], note_no="DN-001")

    login(api, drymill_operator)
    for note_no in ("DN-001", "DN-BUG-1"):
        lookup = api.get(f"{DM}lookup/", {"delivery_note_no": note_no}).data
        _weigh_line(api, lookup["id"], lookup["lines"][0]["id"], "400")
        _lock(api, lookup["id"])
        _submit(api, lookup["id"])

    res = api.get(SUMMARY)
    assert res.status_code == 200, res.data
    assert res.data["count"] == 2
    assert Decimal(res.data["net_weight_kg"]) == Decimal("760")
    assert Decimal(res.data["stock_loss_kg"]) == Decimal("0")

    # A merely-locked receipt (not yet submitted) must not show up in the dashboard.
    login(api, gitoki_clerk)
    create_and_submit(api, gitoki, [one_line(grades["a2"])], note_no="DN-002")
    login(api, drymill_operator)
    pending = api.get(f"{DM}lookup/", {"delivery_note_no": "DN-002"}).data
    _weigh_line(api, pending["id"], pending["lines"][0]["id"], "400")
    _lock(api, pending["id"])

    res = api.get(SUMMARY)
    assert res.data["count"] == 2

    login(api, gitoki_clerk)
    scoped = api.get(SUMMARY)
    assert scoped.data["count"] == 1
    assert Decimal(scoped.data["net_weight_kg"]) == Decimal("380")
