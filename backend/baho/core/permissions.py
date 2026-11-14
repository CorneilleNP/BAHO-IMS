from rest_framework.permissions import SAFE_METHODS, BasePermission

from .access import RoleCode, get_user_access


def HasAnyRole(*codes: str):  # noqa: N802 - reads like a class at the call site
    """Permission factory: `permission_classes = [HasAnyRole("ADMIN", "HQ_FINANCE")]`."""

    class _HasAnyRole(BasePermission):
        message = f"Requires one of the roles: {', '.join(codes)}."

        def has_permission(self, request, view):
            return request.user.is_superuser or get_user_access(request.user).has_any_role(*codes)

    return _HasAnyRole


class IsAdminOrReadOnly(BasePermission):
    """Any signed-in user can read; only ADMIN (or superuser) can write."""

    message = "Only administrators can change this data."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_superuser or get_user_access(request.user).has_any_role(
            RoleCode.ADMIN
        )


class RoleAccess(BasePermission):
    """Reads need one of `view.read_roles`, writes one of `view.write_roles`.

    Superusers always pass. Facility scoping is applied separately by
    FacilityScopedViewSetMixin / the services.
    """

    message = "Your role does not allow this action."

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        roles = view.read_roles if request.method in SAFE_METHODS else view.write_roles
        return get_user_access(user).has_any_role(*roles)


def ensure_facility_access(user, facility) -> None:
    """Raise 403 unless the user is assigned to `facility` (or is global)."""
    from rest_framework.exceptions import PermissionDenied

    if user.is_superuser:
        return
    if not get_user_access(user).can_access_facility(facility.id):
        raise PermissionDenied(f"You are not assigned to {facility.name}.")
