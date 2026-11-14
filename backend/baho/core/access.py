"""Who can see what: the single source of truth for role and facility access.

Replaces the Postgres RLS helpers from legacy/sql/migrations/0006_rls.sql.
Results are cached on the user object for the duration of one request.
"""

from __future__ import annotations

from dataclasses import dataclass, field


class RoleCode:
    ADMIN = "ADMIN"
    CWS_CLERK = "CWS_CLERK"
    CWS_MANAGER = "CWS_MANAGER"
    HQ_FINANCE = "HQ_FINANCE"
    HQ_DRY_MILL_OPERATOR = "HQ_DRY_MILL_OPERATOR"
    HQ_EXPORT_MANAGER = "HQ_EXPORT_MANAGER"


# Roles that see every facility. Deliberately decided by role code only:
# a station role with no facility assigned does NOT become global
# (that was a privilege-escalation gap in the legacy RLS function).
GLOBAL_ROLE_CODES = frozenset(
    {
        RoleCode.ADMIN,
        RoleCode.HQ_FINANCE,
        RoleCode.HQ_DRY_MILL_OPERATOR,
        RoleCode.HQ_EXPORT_MANAGER,
    }
)


@dataclass(frozen=True)
class UserAccess:
    role_codes: frozenset[str] = field(default_factory=frozenset)
    facility_ids: frozenset = field(default_factory=frozenset)
    is_global: bool = False

    def has_any_role(self, *codes: str) -> bool:
        return bool(self.role_codes.intersection(codes))

    def can_access_facility(self, facility_id) -> bool:
        return self.is_global or facility_id in self.facility_ids


_CACHE_ATTR = "_baho_access"


def get_user_access(user) -> UserAccess:
    if user is None or not user.is_authenticated or not user.is_active:
        return UserAccess()
    cached = getattr(user, _CACHE_ATTR, None)
    if cached is not None:
        return cached

    rows = list(
        user.role_assignments.filter(role__is_active=True).values_list("role__code", "facility_id")
    )
    role_codes = frozenset(code for code, _ in rows)
    facility_ids = frozenset(fid for _, fid in rows if fid is not None)
    access = UserAccess(
        role_codes=role_codes,
        facility_ids=facility_ids,
        is_global=user.is_superuser or bool(role_codes & GLOBAL_ROLE_CODES),
    )
    setattr(user, _CACHE_ATTR, access)
    return access


def clear_user_access_cache(user) -> None:
    if hasattr(user, _CACHE_ATTR):
        delattr(user, _CACHE_ATTR)


# --- Role groups used by the API (who may read / write each area) ---------
CWS_READ_ROLES = (RoleCode.ADMIN, RoleCode.HQ_FINANCE, RoleCode.CWS_CLERK, RoleCode.CWS_MANAGER)
CWS_WRITE_ROLES = (RoleCode.ADMIN, RoleCode.CWS_CLERK, RoleCode.CWS_MANAGER)

DRYMILL_READ_ROLES = (
    RoleCode.ADMIN,
    RoleCode.HQ_FINANCE,
    RoleCode.HQ_DRY_MILL_OPERATOR,
    RoleCode.HQ_EXPORT_MANAGER,
)
DRYMILL_WRITE_ROLES = (RoleCode.ADMIN, RoleCode.HQ_DRY_MILL_OPERATOR)
EXPORT_WRITE_ROLES = (RoleCode.ADMIN, RoleCode.HQ_EXPORT_MANAGER)
