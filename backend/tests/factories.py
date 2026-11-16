import factory

from baho.accounts.models import Role, User, UserRole
from baho.organization.models import Facility


class FacilityFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Facility
        django_get_or_create = ["code"]

    code = factory.Sequence(lambda n: f"CWS{n}")
    name = factory.LazyAttribute(lambda o: f"{o.code} CWS")
    facility_type = Facility.FacilityType.CWS


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@test.local")
    full_name = factory.Faker("name")
    password = factory.PostGenerationMethodCall("set_password", "pass12345!")

    @factory.post_generation
    def save_password(obj, create, extracted, **kwargs):
        if create:
            obj.save()


def assign(user, role_code, facility=None):
    return UserRole.objects.create(
        user=user, role=Role.objects.get(code=role_code), facility=facility
    )


def stock_receipt(source_facility, net="1000", bags="0", quality="ACCEPTED", user=None, **extra):
    """An HQ stock receipt through the real service (needs the `hq` fixture)."""
    from datetime import date
    from decimal import Decimal

    from baho.drymill.services import create_stock_receipt
    from baho.processing.models import Process

    if "process" in extra and extra["process"] is None:
        extra.setdefault("require_process", False)  # e.g. an unassigned sub-process
    extra.setdefault("process", Process.objects.get(code="FW"))
    extra.setdefault("grade", "A1")
    return create_stock_receipt(
        user=user,
        arrival_date=extra.pop("arrival_date", None) or date.today(),
        origin_type="OWN_CWS",
        source_facility=source_facility,
        net_weight_kg=Decimal(net),
        weight_of_bags_kg=Decimal(bags),
        quality_status=quality,
        **extra,
    )


def produce_green(source_facility, grade_code="15PLUS", kg="1000", parch="2000", process=None):
    """Mill a fresh receipt so `kg` of green coffee of a grade is in stock."""
    from decimal import Decimal

    from baho.drymill.models import ExportGrade
    from baho.drymill.services import create_dry_mill_batch

    receipt = stock_receipt(source_facility, net=parch)
    return create_dry_mill_batch(
        user=None,
        processing_date=receipt.arrival_date,
        process_product="FULLWASHED A1",
        process=process,
        inputs=[{"receipt": receipt, "qty_kg": Decimal(parch)}],
        outputs=[{"export_grade": ExportGrade.objects.get(code=grade_code), "qty_kg": Decimal(kg)}],
    )
