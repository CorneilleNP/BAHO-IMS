import io
import json
import logging
import urllib.error
import urllib.parse
from datetime import date
from decimal import Decimal
from unittest import mock

import pytest
from django.core.management import call_command

from baho.farmers.models import Farmer
from baho.notifications.backends import AfricasTalkingBackend, SmsSendError
from baho.notifications.models import SmsMessage
from baho.notifications.phones import normalize_rw_phone
from baho.notifications.services import queue_sms, retry_failed, send_message
from baho.reception.services import create_cherry_receipt
from tests.helpers import login

pytestmark = pytest.mark.django_db

URL = "/api/v1/notifications/sms/"
URLOPEN = "baho.notifications.backends.urllib.request.urlopen"


@pytest.fixture
def at_settings(settings):
    settings.SMS_BACKEND = "africastalking"
    settings.SMS_SENDER_ID = "BAHO"
    settings.AFRICASTALKING_USERNAME = "baho"
    settings.AFRICASTALKING_API_KEY = "secret-key"
    settings.AFRICASTALKING_API_URL = "https://at.example.test/version1/messaging"
    return settings


def at_response(payload):
    response = mock.MagicMock()
    response.read.return_value = json.dumps(payload).encode()
    response.__enter__.return_value = response
    return response


AT_SUCCESS = {
    "SMSMessageData": {
        "Message": "Sent to 1/1 Total Cost: RWF 15",
        "Recipients": [
            {
                "statusCode": 101,
                "number": "+250788123456",
                "status": "Success",
                "cost": "RWF 15",
                "messageId": "ATXid_abc123",
            }
        ],
    }
}
AT_REJECTED = {
    "SMSMessageData": {
        "Message": "Sent to 0/1 Total Cost: 0",
        "Recipients": [
            {
                "statusCode": 403,
                "number": "+250788123456",
                "status": "InvalidPhoneNumber",
                "cost": "0",
                "messageId": "None",
            }
        ],
    }
}


def make_farmer(facility, phone="", code="GITOKI-F00001"):
    return Farmer.objects.create(
        farmer_code=code, full_name="Joseph", home_facility=facility, phone=phone
    )


def make_grn(user, facility, farmer):
    return create_cherry_receipt(
        user=user,
        facility=facility,
        farmer=farmer,
        received_on=date.today(),
        lines=[
            {"cherry_grade": "GOOD", "quantity_kg": Decimal("100"), "price_per_kg": Decimal(500)},
            {"cherry_grade": "FLOAT", "quantity_kg": Decimal("20.5"), "price_per_kg": Decimal(200)},
        ],
    )


# --- Phone normalisation ---------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    ["0788123456", "250788123456", "+250788123456", "+250 788 123 456", "078-812-3456"],
)
def test_phone_normalisation_accepts_rwanda_mobile(raw):
    assert normalize_rw_phone(raw) == "+250788123456"


@pytest.mark.parametrize(
    "raw", ["", None, "12345", "0252123456", "+254712345678", "07881234567", "07881234ab"]
)
def test_phone_normalisation_rejects_invalid(raw):
    assert normalize_rw_phone(raw) is None


def test_queue_sms_rejects_invalid_phone(baho_admin):
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        queue_sms(to_phone="12345", body="hi", user=baho_admin)
    assert not SmsMessage.objects.exists()


# --- GRN hook ------------------------------------------------------------------------


def test_grn_queues_and_sends_sms_after_commit(
    gitoki_clerk, gitoki, django_capture_on_commit_callbacks, caplog
):
    farmer = make_farmer(gitoki, phone="0788 123 456")
    with caplog.at_level(logging.INFO, logger="baho.sms"):
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            receipt = make_grn(gitoki_clerk, gitoki, farmer)
        message = SmsMessage.objects.get()
        assert message.status == SmsMessage.Status.QUEUED  # nothing sent before commit
        assert len(callbacks) == 1
        callbacks[0]()

    message.refresh_from_db()
    assert message.status == SmsMessage.Status.SENT
    assert message.provider == "console"
    assert message.attempts == 1
    assert message.sent_at is not None
    assert message.to_phone == "+250788123456"
    assert message.facility == gitoki
    assert message.reference_type == "cherry_receipt"
    assert message.reference_id == str(receipt.pk)
    assert message.created_by == gitoki_clerk
    assert receipt.grn_number in message.body
    assert "Good 100kg" in message.body
    assert "Float 20.50kg" in message.body
    assert "Gitoki CWS" in message.body
    assert date.today().strftime("%d/%m/%Y") in message.body
    assert len(message.body) <= 160
    assert "+250788123456" in caplog.text


def test_grn_via_api_sends_sms(api, gitoki_clerk, gitoki, django_capture_on_commit_callbacks):
    farmer = make_farmer(gitoki, phone="+250788123456")
    login(api, gitoki_clerk)
    payload = {
        "facility": str(gitoki.id),
        "farmer": str(farmer.id),
        "received_on": date.today().isoformat(),
        "payment_method": "CASH",
        "lines": [{"cherry_grade": "GOOD", "quantity_kg": "50", "price_per_kg": "500"}],
    }
    with django_capture_on_commit_callbacks(execute=True):
        res = api.post("/api/v1/reception/receipts/", payload, format="json")
    assert res.status_code == 201, res.data
    message = SmsMessage.objects.get()
    assert message.status == SmsMessage.Status.SENT
    assert "Float 0kg" in message.body


@pytest.mark.parametrize("phone", ["", "12345"])
def test_no_sms_without_valid_phone(
    gitoki_clerk, gitoki, phone, django_capture_on_commit_callbacks
):
    farmer = make_farmer(gitoki, phone=phone)
    with django_capture_on_commit_callbacks(execute=True):
        receipt = make_grn(gitoki_clerk, gitoki, farmer)
    assert receipt.pk
    assert not SmsMessage.objects.exists()


def test_provider_failure_does_not_break_grn(
    at_settings, gitoki_clerk, gitoki, django_capture_on_commit_callbacks
):
    farmer = make_farmer(gitoki, phone="0788123456")
    with mock.patch(URLOPEN, side_effect=urllib.error.URLError("no route")):
        with django_capture_on_commit_callbacks(execute=True):
            receipt = make_grn(gitoki_clerk, gitoki, farmer)
    receipt.refresh_from_db()
    assert receipt.grn_number
    message = SmsMessage.objects.get()
    assert message.status == SmsMessage.Status.FAILED
    assert "no route" in message.error
    assert message.attempts == 1


def test_queue_failure_does_not_break_grn(gitoki_clerk, gitoki, django_capture_on_commit_callbacks):
    farmer = make_farmer(gitoki, phone="0788123456")
    with mock.patch(
        "baho.notifications.services.queue_sms", side_effect=RuntimeError("outbox down")
    ):
        with django_capture_on_commit_callbacks(execute=True):
            receipt = make_grn(gitoki_clerk, gitoki, farmer)
    assert receipt.pk
    assert not SmsMessage.objects.exists()


# --- Africa's Talking backend -------------------------------------------------------


def test_africastalking_success(at_settings, baho_admin, django_capture_on_commit_callbacks):
    with mock.patch(URLOPEN, return_value=at_response(AT_SUCCESS)) as urlopen:
        with django_capture_on_commit_callbacks(execute=True):
            message = queue_sms(to_phone="0788123456", body="Hello", user=baho_admin)

    message.refresh_from_db()
    assert message.status == SmsMessage.Status.SENT
    assert message.provider == "africastalking"
    assert message.provider_message_id == "ATXid_abc123"
    assert message.error == ""

    request = urlopen.call_args.args[0]
    assert urlopen.call_args.kwargs["timeout"] > 0
    assert request.full_url == "https://at.example.test/version1/messaging"
    assert request.get_method() == "POST"
    assert request.get_header("Apikey") == "secret-key"
    assert request.get_header("Accept") == "application/json"
    form = urllib.parse.parse_qs(request.data.decode())
    assert form == {
        "username": ["baho"],
        "to": ["+250788123456"],
        "message": ["Hello"],
        "from": ["BAHO"],
    }


def test_africastalking_without_sender_id_omits_from(at_settings):
    at_settings.SMS_SENDER_ID = ""
    with mock.patch(URLOPEN, return_value=at_response(AT_SUCCESS)) as urlopen:
        AfricasTalkingBackend().send("+250788123456", "Hi")
    form = urllib.parse.parse_qs(urlopen.call_args.args[0].data.decode())
    assert "from" not in form


def test_africastalking_rejected_recipient(at_settings):
    message = SmsMessage.objects.create(to_phone="+250788123456", body="Hi")
    with mock.patch(URLOPEN, return_value=at_response(AT_REJECTED)):
        message = send_message(message)
    assert message.status == SmsMessage.Status.FAILED
    assert "InvalidPhoneNumber" in message.error
    assert "403" in message.error
    assert message.provider_message_id == ""


def test_africastalking_no_recipients_and_http_error(at_settings):
    backend = AfricasTalkingBackend()
    empty = {"SMSMessageData": {"Message": "InvalidSenderId", "Recipients": []}}
    with mock.patch(URLOPEN, return_value=at_response(empty)):
        with pytest.raises(SmsSendError, match="InvalidSenderId"):
            backend.send("+250788123456", "Hi")

    http_error = urllib.error.HTTPError(
        "https://at.example.test", 401, "Unauthorized", {}, io.BytesIO(b"The supplied key")
    )
    with mock.patch(URLOPEN, side_effect=http_error):
        with pytest.raises(SmsSendError, match="HTTP 401"):
            backend.send("+250788123456", "Hi")

    with mock.patch(URLOPEN, return_value=at_response({"oops": 1})):
        with pytest.raises(SmsSendError, match="Unexpected response"):
            backend.send("+250788123456", "Hi")


def test_africastalking_missing_credentials_fails_without_network(at_settings):
    at_settings.AFRICASTALKING_API_KEY = ""
    message = SmsMessage.objects.create(to_phone="+250788123456", body="Hi")
    with mock.patch(URLOPEN) as urlopen:
        message = send_message(message)
    urlopen.assert_not_called()
    assert message.status == SmsMessage.Status.FAILED
    assert "not configured" in message.error


# --- Retry -----------------------------------------------------------------------------


def test_retry_failed_and_management_command(at_settings):
    failing = SmsMessage.objects.create(
        to_phone="+250788123456", body="a", status=SmsMessage.Status.FAILED, attempts=2
    )
    queued = SmsMessage.objects.create(to_phone="+250788123457", body="b")
    exhausted = SmsMessage.objects.create(
        to_phone="+250788123458", body="c", status=SmsMessage.Status.FAILED, attempts=5
    )
    sent = SmsMessage.objects.create(
        to_phone="+250788123459", body="d", status=SmsMessage.Status.SENT, attempts=1
    )

    with mock.patch(URLOPEN, return_value=at_response(AT_SUCCESS)) as urlopen:
        counts = retry_failed()
    assert counts == {"sent": 2, "failed": 0}
    assert urlopen.call_count == 2
    for msg in (failing, queued, exhausted, sent):
        msg.refresh_from_db()
    assert failing.status == SmsMessage.Status.SENT and failing.attempts == 3
    assert queued.status == SmsMessage.Status.SENT and queued.attempts == 1
    assert exhausted.status == SmsMessage.Status.FAILED and exhausted.attempts == 5
    assert sent.attempts == 1

    again = SmsMessage.objects.create(to_phone="+250788123456", body="e")
    out = io.StringIO()
    with mock.patch(URLOPEN, side_effect=urllib.error.URLError("down")):
        call_command("send_pending_sms", stdout=out)
    assert "sent: 0, failed: 1" in out.getvalue()
    again.refresh_from_db()
    assert again.status == SmsMessage.Status.FAILED and again.attempts == 1


def test_send_message_skips_already_sent():
    message = SmsMessage.objects.create(
        to_phone="+250788123456", body="x", status=SmsMessage.Status.SENT, attempts=1
    )
    assert send_message(message).attempts == 1


# --- API --------------------------------------------------------------------------------


def test_outbox_is_admin_only(api, gitoki_clerk, hq_finance):
    SmsMessage.objects.create(to_phone="+250788123456", body="x")
    for user in (gitoki_clerk, hq_finance):
        login(api, user)
        assert api.get(URL).status_code == 403
        assert api.post(f"{URL}test/", {"to_phone": "0788123456"}).status_code == 403
    api.credentials()
    assert api.get(URL).status_code == 401


def test_admin_lists_filters_and_searches(api, baho_admin):
    SmsMessage.objects.create(to_phone="+250788123456", body="x", status="FAILED")
    SmsMessage.objects.create(to_phone="+250722000111", body="y", status="SENT")
    login(api, baho_admin)

    res = api.get(URL)
    assert res.status_code == 200
    assert res.data["count"] == 2

    res = api.get(URL, {"status": "FAILED"})
    assert [m["to_phone"] for m in res.data["results"]] == ["+250788123456"]

    res = api.get(URL, {"search": "722000"})
    assert [m["to_phone"] for m in res.data["results"]] == ["+250722000111"]

    detail = api.get(f"{URL}{res.data['results'][0]['id']}/")
    assert detail.status_code == 200
    assert detail.data["status"] == "SENT"


def test_admin_retries_failed_message(api, baho_admin):
    failed = SmsMessage.objects.create(
        to_phone="+250788123456", body="x", status="FAILED", attempts=1, error="down"
    )
    sent = SmsMessage.objects.create(to_phone="+250788123456", body="y", status="SENT")
    login(api, baho_admin)

    res = api.post(f"{URL}{failed.id}/retry/")
    assert res.status_code == 200, res.data
    assert res.data["status"] == "SENT"
    assert res.data["attempts"] == 2
    assert res.data["error"] == ""

    res = api.post(f"{URL}{sent.id}/retry/")
    assert res.status_code == 400


def test_admin_sends_test_sms(api, baho_admin, django_capture_on_commit_callbacks):
    login(api, baho_admin)
    with django_capture_on_commit_callbacks(execute=True):
        res = api.post(f"{URL}test/", {"to_phone": "0722 000 111"})
    assert res.status_code == 201, res.data
    message = SmsMessage.objects.get(pk=res.data["id"])
    assert message.to_phone == "+250722000111"
    assert message.status == SmsMessage.Status.SENT
    assert message.created_by == baho_admin
    assert "test message" in message.body

    res = api.post(f"{URL}test/", {"to_phone": "12345"})
    assert res.status_code == 400
    assert "to_phone" in res.data
