from datetime import date

import pytest

from baho.core.dates import crop_year_for
from baho.organization.models import CropYear

pytestmark = pytest.mark.django_db


def test_auto_created_crop_year_uses_december_to_november_bounds():
    # A far-future year so the autouse `crop_year` fixture (today's real year,
    # Jan-Dec) can never already cover it.
    crop_year = crop_year_for(date(2051, 11, 19))
    assert crop_year.label == "2051"
    assert crop_year.start_date == date(2050, 12, 1)
    assert crop_year.end_date == date(2051, 11, 30)


def test_a_december_date_belongs_to_next_years_label():
    crop_year = crop_year_for(date(2051, 12, 1))
    assert crop_year.label == "2052"
    assert crop_year.start_date == date(2051, 12, 1)
    assert crop_year.end_date == date(2052, 11, 30)


def test_repeated_calls_reuse_the_same_auto_created_row():
    first = crop_year_for(date(2030, 3, 1))
    second = crop_year_for(date(2030, 6, 1))
    assert first.id == second.id
    assert CropYear.objects.filter(label="2030").count() == 1


def test_an_existing_crop_year_with_custom_bounds_is_used_instead_of_the_default():
    custom = CropYear.objects.create(
        label="custom-2040", start_date=date(2040, 1, 1), end_date=date(2040, 12, 31)
    )
    found = crop_year_for(date(2040, 6, 15))
    assert found.id == custom.id
