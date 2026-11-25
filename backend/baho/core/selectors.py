"""Read/query functions for core."""

from __future__ import annotations

from .access import get_user_access
from .trash import TRASH_TYPES, TRASH_TYPES_BY_CODE, retention


def visible_trash_types(user) -> list:
    """Trash types the user's role may read (same read roles as the records' own lists)."""
    if user.is_superuser:
        return list(TRASH_TYPES)
    access = get_user_access(user)
    return [t for t in TRASH_TYPES if access.has_any_role(*t.read_roles)]


def trash_items(*, user, type_code: str | None = None, facility_id=None) -> list[dict]:
    """Deleted records of every type the user may see, newest deletion first.

    Station users only see records of their own stations; global roles see all.
    Records without a station (export shipments) are shown to global roles only.
    """
    access = get_user_access(user)
    is_global = user.is_superuser or access.is_global
    types = visible_trash_types(user)
    if type_code:
        wanted = TRASH_TYPES_BY_CODE.get(type_code)
        types = [t for t in types if t is wanted]
    keep_for = retention()

    rows: list[dict] = []
    for trash_type in types:
        field = trash_type.facility_field
        if field is None and (not is_global or facility_id):
            continue
        qs = trash_type.get_model().all_objects.filter(is_deleted=True)
        related = ["updated_by"]
        if field:
            related.append(field)
            if not is_global:
                qs = qs.filter(**{f"{field}__in": access.facility_ids})
            if facility_id:
                qs = qs.filter(**{f"{field}_id": facility_id})
        for obj in qs.select_related(*related):
            facility = getattr(obj, field) if field else None
            deleted_at = obj.deleted_at or obj.updated_at
            deleted_by = obj.updated_by
            rows.append(
                {
                    "id": obj.pk,
                    "type": trash_type.code,
                    "type_label": trash_type.label,
                    "number": trash_type.number(obj),
                    "facility": facility.pk if facility else None,
                    "facility_name": facility.name if facility else "",
                    "deleted_by": (deleted_by.full_name or deleted_by.email) if deleted_by else "",
                    "deleted_at": deleted_at,
                    "reason": obj.void_reason,
                    "purge_after": deleted_at + keep_for,
                }
            )
    rows.sort(key=lambda r: r["deleted_at"], reverse=True)
    return rows
