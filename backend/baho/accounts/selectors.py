"""Read/query functions for accounts."""

from .models import UserRole


def user_role_assignments(user):
    return (
        UserRole.objects.filter(user=user, role__is_active=True)
        .select_related("role", "facility")
        .order_by("role__code")
    )
