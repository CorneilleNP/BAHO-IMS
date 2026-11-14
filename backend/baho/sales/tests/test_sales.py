from decimal import Decimal

import pytest

from baho.drymill.models import ExportGrade
from tests.helpers import login

pytestmark = pytest.mark.django_db
CLIENTS = "/api/v1/sales/clients/"
SHIPMENTS = "/api/v1/sales/shipments/"


@pytest.fixture
def client_id(api, export_manager):
    login(api, export_manager)
    return api.post(CLIENTS, {"name": "VOLCAFE", "country": "Switzerland"}).data["id"]


def shipment(client_id, *lines):
    return {
        "client": client_id,
        "lines": [
            {
                "process_product": p,
                "export_grade": str(ExportGrade.objects.get(code=g).id),
                "qty_kg": q,
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
