"""Development seed data. Safe to run repeatedly (idempotent). NOT for production.

python manage.py seed_dev
python manage.py seed_dev --password "SomethingElse1!"
"""

from datetime import date

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from baho.accounts.models import Role, User, UserRole
from baho.core.access import RoleCode
from baho.organization.models import CropYear, Facility

# From legacy/sql/seed/0001_dev_seed.sql.
# NOTE: the old frontend mock put Gitoki in Rubavu/Nyamyumba and Bugoyi in
# Nyabihu/Jenda; the SQL seed says Rutsiro. Confirm with operations.
FACILITIES = [
    ("HQ", "Baho Coffee HQ Dry Mill", Facility.FacilityType.HQ_DRY_MILL, "Kigali City", "Kigali"),
    ("BUGOYI", "Bugoyi CWS", Facility.FacilityType.CWS, "Western", "Rutsiro"),
    ("GITOKI", "Gitoki CWS", Facility.FacilityType.CWS, "Western", "Rutsiro"),
    ("KINAZI", "Kinazi CWS", Facility.FacilityType.CWS, "Southern", "Huye"),
    ("HUMURE", "Humure CWS", Facility.FacilityType.CWS, "Eastern", "Kirehe"),
]

# (email, full name, role code, facility code or None for global)
USERS = [
    ("admin@baho.local", "Dev Admin", RoleCode.ADMIN, None),
    ("hq.finance@baho.local", "HQ Finance (dev)", RoleCode.HQ_FINANCE, None),
    ("drymill@baho.local", "Dry Mill Operator (dev)", RoleCode.HQ_DRY_MILL_OPERATOR, None),
    ("export@baho.local", "Export Manager (dev)", RoleCode.HQ_EXPORT_MANAGER, None),
    ("clerk.gitoki@baho.local", "Gitoki Clerk (dev)", RoleCode.CWS_CLERK, "GITOKI"),
    ("manager.gitoki@baho.local", "Gitoki Manager (dev)", RoleCode.CWS_MANAGER, "GITOKI"),
    ("clerk.bugoyi@baho.local", "Bugoyi Clerk (dev)", RoleCode.CWS_CLERK, "BUGOYI"),
]


class Command(BaseCommand):
    help = "Load development data: crop year, facilities and one user per role."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="BahoDev2026!", help="Password for dev users")

    @transaction.atomic
    def handle(self, *args, password, **options):
        if not settings.DEBUG:
            raise CommandError("seed_dev only runs with DEBUG=true.")

        CropYear.objects.update_or_create(
            label="2026",
            defaults={"start_date": date(2026, 1, 1), "end_date": date(2026, 12, 31)},
        )

        facilities = {}
        for code, name, ftype, province, district in FACILITIES:
            facilities[code], _ = Facility.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "facility_type": ftype,
                    "province": province,
                    "district": district,
                },
            )

        for email, full_name, role_code, facility_code in USERS:
            user, created = User.objects.get_or_create(
                email=email, defaults={"full_name": full_name}
            )
            if created:
                user.set_password(password)
            user.is_staff = role_code == RoleCode.ADMIN
            user.is_superuser = role_code == RoleCode.ADMIN
            user.save()
            UserRole.objects.get_or_create(
                user=user,
                role=Role.objects.get(code=role_code),
                facility=facilities.get(facility_code) if facility_code else None,
            )

        self.stdout.write(self.style.SUCCESS("Seeded crop year 2026, 5 facilities, 7 users."))
        self.stdout.write(f"Dev users (new ones get password '{password}'):")
        for email, _, role_code, facility_code in USERS:
            self.stdout.write(f"  {email:30} {role_code:22} {facility_code or 'ALL'}")
