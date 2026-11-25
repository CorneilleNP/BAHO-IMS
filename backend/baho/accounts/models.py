"""Users, roles and role assignments per facility.

Legacy reference: users / roles / user_roles in legacy/sql/migrations/0001_core_schema.sql
"""

import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from baho.core.access import GLOBAL_ROLE_CODES
from baho.core.models import TimeStampedModel
from baho.core.names import PersonNameMixin


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Users must have an email address.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if not extra["is_staff"] or not extra["is_superuser"]:
            raise ValueError("Superuser must have is_staff=True and is_superuser=True.")
        return self._create_user(email, password, **extra)


class User(PersonNameMixin, AbstractBaseUser, PermissionsMixin):
    """Signs in with email. Accounts are created by an admin (no self sign-up)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False, help_text="Can log into Django admin.")
    must_change_password = models.BooleanField(
        default=False,
        help_text="Set when an admin creates the account or resets the password.",
    )
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return f"{self.full_name} <{self.email}>"


class Role(models.Model):
    """Admin-editable lookup. Codes used in code live in baho.core.access.RoleCode."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def is_global(self) -> bool:
        return self.code in GLOBAL_ROLE_CODES


class UserRole(TimeStampedModel):
    """A role held by a user, at one facility (station roles) or everywhere (HQ roles)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="assignments")
    facility = models.ForeignKey(
        "organization.Facility",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="role_assignments",
        help_text="Required for station roles; leave empty for HQ/global roles.",
    )

    class Meta:
        ordering = ["user", "role"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role", "facility"],
                condition=Q(facility__isnull=False),
                name="user_role_unique_per_facility",
            ),
            models.UniqueConstraint(
                fields=["user", "role"],
                condition=Q(facility__isnull=True),
                name="user_role_unique_global",
            ),
        ]

    def __str__(self):
        where = self.facility.code if self.facility_id else "all facilities"
        return f"{self.user} – {self.role.code} @ {where}"

    def clean(self):
        if self.role_id and not self.role.is_global and not self.facility_id:
            raise ValidationError({"facility": "Station roles must be assigned to a facility."})
