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
from baho.organization.models import AdminUnit, CropYear, Facility

# From legacy/sql/seed/0001_dev_seed.sql.
# NOTE: the old frontend mock put Gitoki in Rubavu/Nyamyumba and Bugoyi in
# Nyabihu/Jenda; the SQL seed says Rutsiro. Confirm with operations.
# (code, name, type, location: a district name, or a province name when only that is known)
FACILITIES = [
    ("HQ", "Baho Coffee HQ Dry Mill", Facility.FacilityType.HQ_DRY_MILL, "Kigali City"),
    ("BUGOYI", "Bugoyi CWS", Facility.FacilityType.CWS, "Rutsiro"),
    ("GITOKI", "Gitoki CWS", Facility.FacilityType.CWS, "Rutsiro"),
    ("KINAZI", "Kinazi CWS", Facility.FacilityType.CWS, "Huye"),
    ("HUMURE", "Humure CWS", Facility.FacilityType.CWS, "Kirehe"),
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
        for code, name, ftype, place in FACILITIES:
            location = (
                AdminUnit.objects.filter(name=place, level__in=["DISTRICT", "PROVINCE"])
                .order_by("level")
                .first()
            )
            facilities[code], _ = Facility.objects.update_or_create(
                code=code,
                defaults={"name": name, "facility_type": ftype, "location": location},
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

        self._seed_gitoki_fully_washed(facilities["GITOKI"])

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded crop year 2026, 5 facilities, 7 users, Gitoki Fully Washed process. "
                "No transactions: farmers, receipts, lots, stock, batches and shipments "
                "are registered through the app."
            )
        )
        self.stdout.write(f"Dev users (new ones get password '{password}'):")
        for email, _, role_code, facility_code in USERS:
            self.stdout.write(f"  {email:30} {role_code:22} {facility_code or 'ALL'}")

    def _seed_gitoki_fully_washed(self, gitoki):
        """Real estimate ratios read from the BAHO GITOKI CWS production workbook (FW sheet)."""
        from baho.processing.models import GradeRatio, ProcessGrade, ProcessType

        crop_year = CropYear.objects.get(label="2026")
        process, _ = ProcessType.objects.get_or_create(
            facility=gitoki, name="Fully Washed", sub_process="Standard Run"
        )
        for order, (code, name, ratio) in enumerate(
            [
                ("A1", "A1", "0.14"),
                ("A2", "A2", "0.04"),
                ("A3", "A3", "0.025"),
                ("HPC", "HPC/A4", "0.015"),
            ],
            start=1,
        ):
            grade, _ = ProcessGrade.objects.update_or_create(
                process_type=process, code=code, defaults={"name": name, "display_order": order}
            )
            GradeRatio.objects.update_or_create(
                grade=grade,
                crop_year=crop_year,
                effective_from=crop_year.start_date,
                defaults={"ratio": ratio},
            )
