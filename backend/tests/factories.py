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
