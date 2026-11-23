"""Shared pytest fixtures for every app's tests."""

import pytest
from rest_framework.test import APIClient

from tests.factories import FacilityFactory, UserFactory, assign


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def gitoki(db):
    return FacilityFactory(code="GITOKI", name="Gitoki CWS")


@pytest.fixture
def bugoyi(db):
    return FacilityFactory(code="BUGOYI", name="Bugoyi CWS")


@pytest.fixture
def baho_admin(db):
    user = UserFactory(email="admin@test.local")
    assign(user, "ADMIN")
    return user


@pytest.fixture
def gitoki_clerk(gitoki):
    user = UserFactory(email="clerk@test.local")
    assign(user, "CWS_CLERK", gitoki)
    return user


@pytest.fixture(autouse=True)
def crop_year(db):
    """A crop year covering today, so services can date transactions."""
    from datetime import date

    from baho.organization.models import CropYear

    today = date.today()
    return CropYear.objects.create(
        label=str(today.year), start_date=date(today.year, 1, 1), end_date=date(today.year, 12, 31)
    )


@pytest.fixture
def hq(db):
    from baho.organization.models import Facility

    return FacilityFactory(
        code="HQ", name="HQ Dry Mill", facility_type=Facility.FacilityType.HQ_DRY_MILL
    )


@pytest.fixture
def bugoyi_clerk(bugoyi):
    user = UserFactory(email="clerk.bugoyi@test.local")
    assign(user, "CWS_CLERK", bugoyi)
    return user


@pytest.fixture
def drymill_operator(hq):
    user = UserFactory(email="drymill@test.local")
    assign(user, "HQ_DRY_MILL_OPERATOR")
    return user


@pytest.fixture
def export_manager(hq):
    user = UserFactory(email="export@test.local")
    assign(user, "HQ_EXPORT_MANAGER")
    return user


@pytest.fixture
def hq_finance(db):
    user = UserFactory(email="finance@test.local")
    assign(user, "HQ_FINANCE")
    return user


@pytest.fixture(autouse=True)
def _clear_cache():
    """Throttle counters live in the cache; every test starts with a clean slate."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()
