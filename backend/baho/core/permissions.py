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
