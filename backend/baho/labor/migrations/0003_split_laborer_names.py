"""Split existing full names into first name (first word) and last name (the rest)."""

from django.db import migrations


def split_names(apps, schema_editor):
    Model = apps.get_model("labor", "CasualLaborer")
    for obj in Model._base_manager.all().only("pk", "full_name", "first_name", "last_name").iterator():
        if obj.first_name or obj.last_name:
            continue
        parts = " ".join((obj.full_name or "").split()).split(" ")
        first, last = parts[0], " ".join(parts[1:])
        Model._base_manager.filter(pk=obj.pk).update(first_name=first, last_name=last)


class Migration(migrations.Migration):
    dependencies = [("labor", "0002_casuallaborer_first_name_casuallaborer_last_name_and_more")]
    operations = [migrations.RunPython(split_names, migrations.RunPython.noop)]
