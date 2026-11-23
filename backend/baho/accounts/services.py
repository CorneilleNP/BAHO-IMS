"""Write operations for accounts. Every multi-row write is @transaction.atomic."""

from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from baho.core.access import GLOBAL_ROLE_CODES, RoleCode, clear_user_access_cache

from .models import Role, User, UserRole


def _check_password(password: str, user: User | None = None, field: str = "password") -> None:
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise ValidationError({field: list(exc.messages)}) from exc


def _normalise_email(email: str) -> str:
    return User.objects.normalize_email(email).strip().lower()


def revoke_refresh_tokens(user: User) -> None:
    """Sign the user out everywhere: every refresh token they hold stops working."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def _validated_assignments(assignments: list[dict]) -> list[tuple[Role, object]]:
    """[{role: "CWS_CLERK", facility: Facility | None}] -> [(Role, Facility | None)], checked."""
    rows = []
    seen = set()
    for item in assignments:
        code = item["role"]
        facility = item.get("facility")
        role = Role.objects.filter(code=code, is_active=True).first()
        if role is None:
            raise ValidationError({"roles": [f"Unknown role {code}."]})
        if code in GLOBAL_ROLE_CODES:
            facility = None  # HQ roles see every facility; a station would be meaningless
        elif facility is None:
            raise ValidationError({"roles": [f"{role.name} must be assigned to a station."]})
        key = (role.pk, getattr(facility, "pk", None))
        if key in seen:
            continue
        seen.add(key)
        rows.append((role, facility))
    if not rows:
        raise ValidationError({"roles": ["Give the user at least one role."]})
    return rows


def _replace_roles(user: User, assignments: list[dict]) -> None:
    rows = _validated_assignments(assignments)
    UserRole.objects.filter(user=user).delete()
    UserRole.objects.bulk_create(
        [UserRole(user=user, role=role, facility=facility) for role, facility in rows]
    )
    clear_user_access_cache(user)


@transaction.atomic
def create_user(
    *, email: str, full_name: str, password: str, phone: str = "", roles: list[dict]
) -> User:
    email = _normalise_email(email)
    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError({"email": ["A user with this email already exists."]})
    user = User(email=email, full_name=full_name.strip(), phone=phone.strip())
    _check_password(password, user)
    user.set_password(password)
    user.must_change_password = True  # the admin knows it; the user picks their own
    user.save()
    _replace_roles(user, roles)
    return user


def _is_admin(user: User) -> bool:
    return UserRole.objects.filter(user=user, role__code=RoleCode.ADMIN).exists()


def _ensure_an_admin_remains(user: User, *, keeps_admin: bool, stays_active: bool) -> None:
    if (keeps_admin and stays_active) or not _is_admin(user):
        return
    others = (
        UserRole.objects.filter(role__code=RoleCode.ADMIN, user__is_active=True)
        .exclude(user=user)
        .exists()
    )
    if not others:
        raise ValidationError({"detail": "Keep at least one active administrator."})


@transaction.atomic
def update_user(
    user: User,
    *,
    acting_user: User,
    full_name: str | None = None,
    phone: str | None = None,
    is_active: bool | None = None,
    roles: list[dict] | None = None,
) -> User:
    user = User.objects.select_for_update().get(pk=user.pk)
    stays_active = user.is_active if is_active is None else is_active
    keeps_admin = (
        any(item["role"] == RoleCode.ADMIN for item in roles)
        if roles is not None
        else _is_admin(user)
    )
    if user.pk == acting_user.pk and _is_admin(user) and not (stays_active and keeps_admin):
        raise ValidationError(
            {"detail": "You cannot deactivate yourself or remove your own admin role."}
        )
    _ensure_an_admin_remains(user, keeps_admin=keeps_admin, stays_active=stays_active)

    if full_name is not None:
        user.full_name = full_name.strip()
    if phone is not None:
        user.phone = phone.strip()
    if is_active is not None:
        user.is_active = is_active
    user.save()
    if roles is not None:
        _replace_roles(user, roles)
    if not user.is_active:
        revoke_refresh_tokens(user)
    return user


@transaction.atomic
def reset_password(user: User, *, new_password: str) -> User:
    """An admin sets a temporary password; the user must change it at next sign-in."""
    _check_password(new_password, user)
    user.set_password(new_password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_refresh_tokens(user)
    return user


@transaction.atomic
def change_own_password(user: User, *, current_password: str, new_password: str) -> User:
    if not user.check_password(current_password):
        raise ValidationError({"current_password": ["Current password is incorrect."]})
    if current_password == new_password:
        raise ValidationError({"new_password": ["Choose a different password."]})
    _check_password(new_password, user, field="new_password")
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_refresh_tokens(user)
    return user
