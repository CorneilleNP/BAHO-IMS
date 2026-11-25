"""People's names: first name + last name, with `full_name` kept for display/search.

Used by farmers, casual laborers and user accounts. Rule (all modules): at least
one of first name / last name is required. `full_name` is always derived from
them ("First Last"), so every list, search and report keeps working unchanged.

Older clients (and saves queued offline by an older app) may still send only
`full_name`: it is split into first name (first word) and last name (the rest).
"""

from __future__ import annotations

from django.db import models
from rest_framework import serializers

NAME_REQUIRED = "Enter a first name or a last name (at least one)."


def clean(value: str | None) -> str:
    return " ".join((value or "").split())


def join_name(first: str | None, last: str | None) -> str:
    return " ".join(part for part in (clean(first), clean(last)) if part)


def split_full_name(full: str | None) -> tuple[str, str]:
    parts = clean(full).split(" ")
    if not parts or parts == [""]:
        return "", ""
    return parts[0], " ".join(parts[1:])


class PersonNameMixin(models.Model):
    """Adds first/last name to a model that has a `full_name` field."""

    first_name = models.CharField(max_length=75, blank=True)
    last_name = models.CharField(max_length=75, blank=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.sync_person_name()
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and {"first_name", "last_name", "full_name"} & set(
            update_fields
        ):
            kwargs["update_fields"] = {*update_fields, "first_name", "last_name", "full_name"}
        super().save(*args, **kwargs)

    def sync_person_name(self) -> None:
        self.first_name = clean(self.first_name)
        self.last_name = clean(self.last_name)
        if self.first_name or self.last_name:
            self.full_name = join_name(self.first_name, self.last_name)
        elif getattr(self, "full_name", ""):
            self.first_name, self.last_name = split_full_name(self.full_name)
            self.full_name = join_name(self.first_name, self.last_name)


class PersonNameSerializerMixin(serializers.Serializer):
    """first_name / last_name in, full_name out (also accepted in, for old clients)."""

    first_name = serializers.CharField(max_length=75, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=75, required=False, allow_blank=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        has_first, has_last = "first_name" in attrs, "last_name" in attrs
        legacy_full = attrs.get("full_name")
        if legacy_full is not None and not has_first and not has_last:
            attrs["first_name"], attrs["last_name"] = split_full_name(legacy_full)
            has_first = has_last = True
        instance = getattr(self, "instance", None)
        creating = instance is None and not getattr(self, "partial", False)
        if not (creating or has_first or has_last):
            return attrs  # an edit that doesn't touch the name
        # On an edit, the half that wasn't sent keeps its stored value.
        first = (
            clean(attrs["first_name"]) if has_first else clean(getattr(instance, "first_name", ""))
        )
        last = clean(attrs["last_name"]) if has_last else clean(getattr(instance, "last_name", ""))
        if not first and not last:
            raise serializers.ValidationError({"first_name": [NAME_REQUIRED]})
        if has_first:
            attrs["first_name"] = first
        if has_last:
            attrs["last_name"] = last
        attrs["full_name"] = join_name(first, last)
        return attrs
