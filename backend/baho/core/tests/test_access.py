import pytest
from django.core.exceptions import ValidationError

from baho.accounts.models import Role, UserRole
from baho.core.access import get_user_access
from tests.factories import UserFactory, assign

pytestmark = pytest.mark.django_db


def test_hq_roles_are_global(gitoki):
    user = UserFactory()
    assign(user, "HQ_FINANCE")
    assert get_user_access(user).is_global


def test_station_clerk_is_scoped_to_their_facility(gitoki_clerk, gitoki, bugoyi):
    access = get_user_access(gitoki_clerk)
    assert not access.is_global
    assert access.can_access_facility(gitoki.id)
    assert not access.can_access_facility(bugoyi.id)


def test_station_role_without_facility_is_not_global():
    """Regression for the legacy RLS gap: null facility must not grant global access."""
    user = UserFactory()
    UserRole.objects.create(user=user, role=Role.objects.get(code="CWS_CLERK"), facility=None)
    assert not get_user_access(user).is_global


def test_station_role_without_facility_fails_validation():
    user = UserFactory()
    ur = UserRole(user=user, role=Role.objects.get(code="CWS_CLERK"), facility=None)
    with pytest.raises(ValidationError):
        ur.full_clean()


def test_inactive_role_grants_nothing(gitoki_clerk):
    Role.objects.filter(code="CWS_CLERK").update(is_active=False)
    assert get_user_access(gitoki_clerk).role_codes == frozenset()


def test_user_with_no_roles_has_no_access():
    access = get_user_access(UserFactory())
    assert not access.is_global and not access.facility_ids
