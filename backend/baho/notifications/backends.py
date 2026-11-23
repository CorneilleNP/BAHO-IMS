"""SMS delivery backends. Chosen by settings.SMS_BACKEND ("console" or "africastalking")."""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger("baho.sms")

# Africa's Talking per-recipient status codes that mean "accepted for delivery".
_AT_OK_CODES = {100, 101, 102}


class SmsSendError(Exception):
    """The provider did not accept the message."""


@dataclass(frozen=True)
class SendResult:
    provider: str
    message_id: str = ""


class ConsoleBackend:
    """Development/test backend: logs the message and treats it as sent."""

    name = "console"

    def send(self, to: str, body: str) -> SendResult:
        logger.info("SMS to %s: %s", to, body)
        return SendResult(provider=self.name)


class AfricasTalkingBackend:
    """Sends through the Africa's Talking messaging REST API (standard library only)."""

    name = "africastalking"
    timeout = 15  # seconds

    def send(self, to: str, body: str) -> SendResult:
        username = settings.AFRICASTALKING_USERNAME
        api_key = settings.AFRICASTALKING_API_KEY
        if not username or not api_key:
            raise SmsSendError("Africa's Talking username/API key are not configured.")

        form = {"username": username, "to": to, "message": body}
        if settings.SMS_SENDER_ID:
            form["from"] = settings.SMS_SENDER_ID
        request = urllib.request.Request(
            settings.AFRICASTALKING_API_URL,
            data=urllib.parse.urlencode(form).encode(),
            headers={
                "apiKey": api_key,
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310
                payload = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read()[:300].decode(errors="replace") if exc.fp else ""
            raise SmsSendError(f"HTTP {exc.code}: {detail}".strip()) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise SmsSendError(f"Network error: {exc}") from exc

        return SendResult(provider=self.name, message_id=self._parse(payload))

    @staticmethod
    def _parse(payload: bytes) -> str:
        try:
            data = json.loads(payload)
            sms_data = data["SMSMessageData"]
        except (ValueError, KeyError, TypeError) as exc:
            raise SmsSendError(f"Unexpected response: {payload[:300]!r}") from exc
        recipients = sms_data.get("Recipients") or []
        if not recipients:
            raise SmsSendError(sms_data.get("Message") or "No recipients in response.")
        recipient = recipients[0]
        status = recipient.get("status", "")
        code = recipient.get("statusCode")
        if status != "Success" and code not in _AT_OK_CODES:
            raise SmsSendError(f"{status or 'Rejected'} (code {code})")
        return str(recipient.get("messageId") or "")


BACKENDS = {
    ConsoleBackend.name: ConsoleBackend,
    AfricasTalkingBackend.name: AfricasTalkingBackend,
}


def get_backend():
    name = (settings.SMS_BACKEND or "console").lower()
    try:
        return BACKENDS[name]()
    except KeyError:
        raise SmsSendError(f"Unknown SMS_BACKEND {name!r}.") from None
