from django.db import migrations

from baho.organization.locations import load_rwanda_admin_units


def load(apps, schema_editor):
    load_rwanda_admin_units(apps.get_model("organization", "AdminUnit"))


def unload(apps, schema_editor):
    apps.get_model("organization", "AdminUnit").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("organization", "0002_remove_facility_cell_remove_facility_district_and_more")]
    operations = [migrations.RunPython(load, unload)]
