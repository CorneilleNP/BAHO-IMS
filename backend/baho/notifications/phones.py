"""Rwanda mobile number normalisation."""

import re

_RW_MOBILE = re.compile(r"^(?:\+?250|0)?(7\d{8})$")


def normalize_rw_phone(raw) -> str | None:
    """Return the number as +2507XXXXXXXX, or None when it is not a Rwanda mobile number.

    Accepts 07XXXXXXXX, 2507XXXXXXXX and +2507XXXXXXXX; spaces, dashes, dots
    and brackets are ignored.
    """
    if not raw:
        return None
    cleaned = re.sub(r"[\s\-().]", "", str(raw))
    match = _RW_MOBILE.match(cleaned)
    return f"+250{match.group(1)}" if match else None
