from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade
from baho.processing.models import Process
from tests.factories import produce_green
from tests.helpers import login

pytestmark = pytest.mark.django_db
CLIENTS = "/api/v1/sales/clients/"
SHIPMENTS = "/api/v1/sales/shipments/"
AVAILABLE = "/api/v1/sales/shipments/available/"


@pytest.fixture
def client_id(api, export_manager, gitoki, hq):
    produce_green(gitoki, "15PLUS", kg="20000", parch="30000")
    produce_green(gitoki, "1314", kg="20000", parch="30000")
    login(api, export_manager)
    return api.post(CLIENTS, {"name": "VOLCAFE", "country": "Switzerland"}).data["id"]


def shipment(client_id, *lines, process=None, source_facility=None):
    return {
        "client": client_id,
        "lines": [
            {
                "process_product": p,
                "export_grade": str(ExportGrade.objects.get(code=g).id),
                "qty_kg": q,
                **({"process": process} if process else {}),
                **({"source_facility": source_facility} if source_facility else {}),
            }
            for p, g, q in lines
        ],
    }


def test_shipment_with_lines(api, client_id):
    res = api.post(
        SHIPMENTS,
        shipment(client_id, ("FULLWASHED A1", "15PLUS", "18400"), ("NATURAL A1", "1314", "20000")),
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["shipment_no"].startswith("EXP-")
    assert Decimal(res.data["total_qty_kg"]) == Decimal("38400")
    assert res.data["client_name"] == "VOLCAFE"


def test_shipment_needs_a_line(api, client_id):
    assert api.post(SHIPMENTS, shipment(client_id), format="json").status_code == 400


def test_shipment_status_update(api, client_id):
    created = api.post(SHIPMENTS, shipment(client_id, ("FW", "15PLUS", "100")), format="json").data
    res = api.post(f"{SHIPMENTS}{created['id']}/status/", {"status": "SHIPPED"})
    assert res.status_code == 200
    assert res.data["status"] == "SHIPPED"


def test_dry_mill_operator_cannot_record_shipments(api, drymill_operator, client_id):
    login(api, drymill_operator)
    assert api.get(SHIPMENTS).status_code == 200
    res = api.post(SHIPMENTS, shipment(client_id, ("FW", "15PLUS", "100")), format="json")
    assert res.status_code == 403


def test_cannot_ship_more_green_coffee_than_in_stock(api, client_id):
    res = api.post(SHIPMENTS, shipment(client_id, ("FW", "15PLUS", "20001")), format="json")
    assert res.status_code == 400
    assert "Not enough green coffee" in str(res.data)
    assert (
        api.post(
            SHIPMENTS, shipment(client_id, ("FW", "15PLUS", "20000")), format="json"
        ).status_code
        == 201
    )
    res = api.post(SHIPMENTS, shipment(client_id, ("FW", "15PLUS", "1")), format="json")
    assert res.status_code == 400  # already all shipped


def test_green_stock_is_scoped_by_process(api, export_manager, gitoki, hq, client_id):
    """Shipping against one process can't draw down another process's stock of the same grade."""
    fw = Process.objects.get(code="FW")
    nn = Process.objects.get(code="NN")
    plus17 = str(ExportGrade.objects.get(code="17PLUS").id)
    produce_green(gitoki, "17PLUS", kg="1000", parch="1500", process=fw)
    produce_green(gitoki, "17PLUS", kg="1000", parch="1500", process=nn)

    login(api, export_manager)
    res = api.get(AVAILABLE, {"process": str(fw.id), "export_grade": plus17})
    assert res.status_code == 200
    assert Decimal(res.data["available_kg"]) == Decimal("1000")

    # Shipping all of FW's 17+ must not touch NN's 17+.
    fw_shipment = shipment(client_id, ("FW 17+", "17PLUS", "1000"), process=str(fw.id))
    res = api.post(SHIPMENTS, fw_shipment, format="json")
    assert res.status_code == 201, res.data
    res = api.get(AVAILABLE, {"process": str(nn.id), "export_grade": plus17})
    assert Decimal(res.data["available_kg"]) == Decimal("1000")

    # FW's 17+ is now exhausted.
    fw_shipment_2 = shipment(client_id, ("FW 17+", "17PLUS", "1"), process=str(fw.id))
    res = api.post(SHIPMENTS, fw_shipment_2, format="json")
    assert res.status_code == 400


def test_green_stock_is_scoped_by_source(api, export_manager, gitoki, bugoyi, hq, client_id):
    """Shipping against one CWS's green coffee can't draw down another CWS's stock."""
    plus17 = str(ExportGrade.objects.get(code="17PLUS").id)
    produce_green(gitoki, "17PLUS", kg="500", parch="800")
    produce_green(bugoyi, "17PLUS", kg="500", parch="800")

    login(api, export_manager)
    res = api.get(AVAILABLE, {"source_facility": str(gitoki.id), "export_grade": plus17})
    assert Decimal(res.data["available_kg"]) == Decimal("500")

    gitoki_source = str(gitoki.id)
    body = shipment(client_id, ("FW 17+", "17PLUS", "500"), source_facility=gitoki_source)
    res = api.post(SHIPMENTS, body, format="json")
    assert res.status_code == 201, res.data

    res = api.get(AVAILABLE, {"source_facility": str(bugoyi.id), "export_grade": plus17})
    assert Decimal(res.data["available_kg"]) == Decimal("500")

    body = shipment(client_id, ("FW 17+", "17PLUS", "1"), source_facility=gitoki_source)
    res = api.post(SHIPMENTS, body, format="json")
    assert res.status_code == 400


def test_batch_with_shipped_green_coffee_cannot_be_voided(api, client_id, drymill_operator):
    from baho.drymill.models import DryMillBatch

    batch = DryMillBatch.objects.filter(outputs__export_grade__code="15PLUS").get()
    res = api.post(SHIPMENTS, shipment(client_id, ("FW", "15PLUS", "100")), format="json")
    assert res.status_code == 201
    login(api, drymill_operator)
    res = api.post(f"/api/v1/drymill/batches/{batch.id}/void/", {"reason": "wrong receipt"})
    assert res.status_code == 400
    assert "already been shipped" in str(res.data)
    batch.refresh_from_db()
    assert batch.is_deleted is False


def test_batch_without_shipments_can_still_be_voided(api, client_id, drymill_operator):
    from baho.drymill.models import DryMillBatch

    batch = DryMillBatch.objects.filter(outputs__export_grade__code="1314").get()
    login(api, drymill_operator)
    res = api.post(f"/api/v1/drymill/batches/{batch.id}/void/", {"reason": "wrong receipt"})
    assert res.status_code == 200


@pytest.mark.django_db(transaction=True)
def test_concurrent_shipments_cannot_oversell(export_manager, gitoki, hq):
    """Two shipments for the last 15 000 kg, saved at the same moment: only one wins.

    Needs real row locks, so it only runs against PostgreSQL (CI)."""
    import threading

    from django.db import connection

    from baho.sales.models import Client, ExportShipmentLine
    from baho.sales.services import create_shipment

    if connection.vendor != "postgresql":
        pytest.skip("row locking needs PostgreSQL")

    produce_green(gitoki, "15PLUS", kg="20000", parch="30000")
    client = Client.objects.create(name="VOLCAFE")
    grade = ExportGrade.objects.get(code="15PLUS")
    barrier = threading.Barrier(2)
    results = []

    def ship():
        from datetime import date

        from django.db import connection as conn

        try:
            barrier.wait()
            create_shipment(
                user=export_manager,
                client=client,
                delivery_to_naeb_date=date.today(),
                lines=[{"export_grade": grade, "qty_kg": Decimal("15000")}],
            )
            results.append("ok")
        except Exception as exc:  # noqa: BLE001
            results.append(type(exc).__name__)
        finally:
            conn.close()

    threads = [threading.Thread(target=ship) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == ["ValidationError", "ok"]
    assert ExportShipmentLine.objects.count() == 1
