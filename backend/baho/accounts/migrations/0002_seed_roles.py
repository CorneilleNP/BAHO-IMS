from django.db import migrations

ROLES = [
    ("ADMIN", "Administrator", "Full access; manages users and reference data."),
    ("CWS_CLERK", "CWS Data Clerk", "Records reception, processing and expenses at one station."),
    ("CWS_MANAGER", "CWS Manager", "Approves and oversees one station's data."),
    ("HQ_FINANCE", "HQ Finance", "Sees all stations' finance and cost data."),
    ("HQ_DRY_MILL_OPERATOR", "HQ Dry Mill Operator", "HQ stock receiving and dry milling."),
    ("HQ_EXPORT_MANAGER", "HQ Export Manager", "Clients, contracts and export shipments."),
]


def seed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    for code, name, description in ROLES:
        Role.objects.update_or_create(
            code=code, defaults={"name": name, "description": description}
        )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [migrations.RunPython(seed_roles, migrations.RunPython.noop)]
