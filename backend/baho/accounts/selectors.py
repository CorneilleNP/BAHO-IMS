"""Read/query functions for accounts."""

from django.db.models import Prefetch, Q

from .models import Role, User, UserRole


def user_role_assignments(user):
    return (
        UserRole.objects.filter(user=user, role__is_active=True)
        .select_related("role", "facility")
        .order_by("role__code")
    )


def user_list(*, search: str = "", active: bool | None = None):
    qs = User.objects.prefetch_related(
        Prefetch(
            "role_assignments",
            queryset=UserRole.objects.select_related("role", "facility").order_by("role__code"),
        )
    ).order_by("full_name")
    if search:
        qs = qs.filter(
            Q(full_name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search)
        )
    if active is not None:
        qs = qs.filter(is_active=active)
    return qs


def active_roles():
    return Role.objects.filter(is_active=True).order_by("name")
