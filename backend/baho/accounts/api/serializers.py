from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from baho.core.access import get_user_access
from baho.organization.models import Facility

from ..models import Role, User
from ..selectors import user_role_assignments


class LoginSerializer(TokenObtainPairSerializer):
    """Email + password -> access/refresh tokens.

    Claims are for the UI only (menus, default facility). The server always
    re-checks roles from the database, never trusts these claims.
    """

    def validate(self, attrs):
        attrs[self.username_field] = str(attrs.get(self.username_field, "")).strip().lower()
        return super().validate(attrs)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        access = get_user_access(user)
        token["email"] = user.email
        token["full_name"] = user.full_name
        token["roles"] = sorted(access.role_codes)
        token["facility_ids"] = sorted(str(f) for f in access.facility_ids)
        token["is_global"] = access.is_global
        return token


class RefreshRequestSerializer(serializers.Serializer):
    """The refresh token normally comes from the httpOnly cookie; the body is a fallback."""

    refresh = serializers.CharField(required=False)


class AccessTokenSerializer(serializers.Serializer):
    access = serializers.CharField()


class FacilityRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    name = serializers.CharField()
    facility_type = serializers.CharField()


class RoleAssignmentSerializer(serializers.Serializer):
    role = serializers.CharField(source="role.code")
    role_name = serializers.CharField(source="role.name")
    facility = FacilityRefSerializer(allow_null=True)


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    is_global = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "phone", "is_global", "must_change_password", "roles"]

    def get_roles(self, user) -> list[dict]:
        return RoleAssignmentSerializer(user_role_assignments(user), many=True).data

    def get_is_global(self, user) -> bool:
        return get_user_access(user).is_global


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False, min_length=8)


# --- User management (ADMIN only) --------------------------------------------------


class RoleSerializer(serializers.ModelSerializer):
    is_global = serializers.BooleanField(read_only=True)

    class Meta:
        model = Role
        fields = ["code", "name", "description", "is_global"]


class RoleAssignmentInputSerializer(serializers.Serializer):
    role = serializers.SlugRelatedField(
        slug_field="code", queryset=Role.objects.filter(is_active=True)
    )
    facility = serializers.PrimaryKeyRelatedField(
        queryset=Facility.objects.all(), allow_null=True, required=False
    )

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        return {"role": value["role"].code, "facility": value.get("facility")}


class UserSerializer(serializers.ModelSerializer):
    roles = RoleAssignmentSerializer(source="role_assignments", many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone",
            "is_active",
            "must_change_password",
            "last_login",
            "date_joined",
            "roles",
        ]
        read_only_fields = fields


class UserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    password = serializers.CharField(trim_whitespace=False, min_length=8)
    roles = RoleAssignmentInputSerializer(many=True)


class UserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    roles = RoleAssignmentInputSerializer(many=True, required=False)


class ResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(trim_whitespace=False, min_length=8)
