from django.db import migrations

# Baho's five processes. Aliases are labels (normalised: A-Z/0-9 only) that mean
# the process itself; everything else becomes a sub-process assigned on the
# Processes screen.
PROCESSES = [
    ("FW", "Fully Washed", 1, ["FW", "FULLYWASHED", "FULLWASHED", "FULLWASH"]),
    ("AFW", "Anaerobic Fully Washed", 2, ["ANAEROBICW", "ANAEROBICFW", "ANAEROBICFULLWASHED", "ANAEROBICWASHED"]),
    ("NN", "Normal Natural", 3, ["NATURALN", "NATURAL", "NORMALNATURAL", "NNAT", "NNATURAL"]),
    ("AN", "Anaerobic Natural", 4, ["ANAEROBICNAT", "ANAEROBICNATURAL"]),
    ("HONEY", "Honey & Honey Anaerobic", 5, ["HONEY", "HONEYHONEYANAEROBIC", "HONEYANDHONEYANAEROBIC"]),
]


def seed(apps, schema_editor):
    Process = apps.get_model("processing", "Process")
    for code, name, order, aliases in PROCESSES:
        Process.objects.update_or_create(
            code=code, defaults={"name": name, "display_order": order, "aliases": aliases}
        )


class Migration(migrations.Migration):
    dependencies = [("processing", "0003_process_subprocess_subprocessalias")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
