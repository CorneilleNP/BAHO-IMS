from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from baho.core.access import get_user_access

from ..models import User
from ..selectors import user_role_assignments


class LoginSerializer(TokenObtainPairSerializer):
    """Email + password -> access/refresh tokens.

    Claims are for the UI only (menus, default facility). The server always
    re-checks roles from the database, never trusts these claims.
    """

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
        fields = ["id", "email", "full_name", "phone", "is_global", "roles"]

    def get_roles(self, user) -> list[dict]:
        return RoleAssignmentSerializer(user_role_assignments(user), many=True).data

    def get_is_global(self, user) -> bool:
        return get_user_access(user).is_global
