import pytest

from baho.drymill.models import HqStockReceipt
from baho.processing.catalog import resolve_process_label
from baho.processing.models import Process, SubProcess, SubProcessAlias
from tests.factories import stock_receipt
from tests.helpers import login

pytestmark = pytest.mark.django_db
SUBS = "/api/v1/processing/catalog/sub-processes/"


def test_exactly_five_processes():
    assert list(Process.objects.values_list("name", flat=True)) == [
        "Fully Washed",
        "Anaerobic Fully Washed",
        "Normal Natural",
        "Anaerobic Natural",
        "Honey & Honey Anaerobic",
    ]


def test_resolve_labels():
    fw = Process.objects.get(code="FW")
    assert resolve_process_label("fw") == (fw, None)
    assert resolve_process_label("NATURAL N")[0].code == "NN"
    process, sub = resolve_process_label("Washed no 1")
    assert process is None and sub.name == "WASHED NO 1"  # new, unassigned
    # spelling variant resolves to the same sub-process
    assert resolve_process_label("WASHED NO1")[1] == sub
    assert SubProcess.objects.count() == 1


def test_assign_selected_sub_processes_moves_receipts(api, drymill_operator, gitoki, hq):
    _, a = resolve_process_label("FOREST WASHED")
    _, b = resolve_process_label("FW SEASON B")
    receipt = stock_receipt(gitoki, process=None, sub_process=a)
    login(api, drymill_operator)
    fw = Process.objects.get(code="FW")
    res = api.post(
        f"{SUBS}assign/", {"ids": [str(a.id), str(b.id)], "process": str(fw.id)}, format="json"
    )
    assert res.data == {"updated": 2}
    receipt.refresh_from_db()
    assert receipt.process == fw
    listed = api.get(f"{SUBS}?process={fw.id}").data
    assert {s["name"] for s in listed} == {"FOREST WASHED", "FW SEASON B"}
    assert next(s for s in listed if s["name"] == "FOREST WASHED")["receipts"] == 1


def test_unassigned_list_has_suggestions(api, drymill_operator):
    resolve_process_label("ANAER NAT 140HRS")
    resolve_process_label("ECLIPSE")
    login(api, drymill_operator)
    subs = {s["name"]: s for s in api.get(f"{SUBS}?unassigned=true").data}
    assert subs["ANAER NAT 140HRS"]["suggested_process"]["name"] == "Anaerobic Natural"
    assert subs["ECLIPSE"]["suggested_process"] is None


def test_merge_duplicates(api, drymill_operator, gitoki, hq):
    keep = SubProcess.objects.create(name="WASHED NO 10", process=Process.objects.get(code="FW"))
    dup = SubProcess.objects.create(name="WASHED NO.10 OLD")
    receipt = stock_receipt(gitoki, process=None, sub_process=dup)
    login(api, drymill_operator)
    res = api.post(
        f"{SUBS}merge/", {"ids": [str(keep.id), str(dup.id)], "into": str(keep.id)}, format="json"
    )
    assert res.status_code == 200, res.data
    assert not SubProcess.objects.filter(pk=dup.pk).exists()
    receipt.refresh_from_db()
    assert (receipt.sub_process, receipt.process.code) == (keep, "FW")
    assert resolve_process_label("Washed no.10 old")[1] == keep  # old name became an alias


def test_rename_keeps_old_name_as_alias(api, drymill_operator):
    sub = SubProcess.objects.create(name="NAT NO 2 MTC LOT")
    login(api, drymill_operator)
    res = api.patch(f"{SUBS}{sub.id}/", {"name": "Natural MTC lot 2"}, format="json")
    assert res.data["name"] == "NATURAL MTC LOT 2"
    assert SubProcessAlias.objects.filter(sub_process=sub, label="NAT NO 2 MTC LOT").exists()


def test_name_clash_is_refused(api, drymill_operator):
    SubProcess.objects.create(name="ECLIPSE NAT")
    login(api, drymill_operator)
    assert api.post(SUBS, {"name": "Eclipse  nat"}).status_code == 400
    assert api.post(SUBS, {"name": "FW"}).status_code == 400  # that is a process itself


def test_cws_clerk_can_read_but_not_manage(api, gitoki_clerk):
    sub = SubProcess.objects.create(name="X")
    login(api, gitoki_clerk)
    assert api.get(SUBS).status_code == 200
    assert (
        api.post(
            f"{SUBS}assign/", {"ids": [str(sub.id)], "process": None}, format="json"
        ).status_code
        == 403
    )


def test_receipts_without_process_can_be_listed(api, drymill_operator, gitoki, hq):
    _, sub = resolve_process_label("ECLIPSE")
    stock_receipt(gitoki, process=None, sub_process=sub, require_process=False)
    login(api, drymill_operator)
    assert api.get("/api/v1/drymill/stock-receipts/?process_unassigned=true").data["count"] == 1
    assert HqStockReceipt.objects.filter(process__isnull=True).count() == 1


def test_process_list_with_counts(api, drymill_operator, gitoki, hq):
    fw = Process.objects.get(code="FW")
    SubProcess.objects.create(name="FOREST WASHED", process=fw)
    stock_receipt(gitoki, net="1000")
    login(api, drymill_operator)
    res = api.get("/api/v1/processing/catalog/processes/")
    assert res.status_code == 200
    row = next(p for p in res.data if p["code"] == "FW")
    assert (row["sub_processes"], row["receipts"]) == (1, 1)
    assert float(row["net_weight_kg"]) == 1000
