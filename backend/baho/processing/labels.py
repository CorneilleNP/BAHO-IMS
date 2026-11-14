"""Label normalisation shared by models and services (no model imports here)."""

import re


def label_key(text: str) -> str:
    """Spelling-insensitive key: "Washed no 1", "WASHED NO1" -> "WASHEDNO1"."""
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def clean_label(text: str) -> str:
    """Display form of a label: upper case, single spaces."""
    return re.sub(r"\s+", " ", (text or "").strip()).upper()
