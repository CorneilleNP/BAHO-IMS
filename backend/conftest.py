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
