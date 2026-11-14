from django.db import migrations

# Green coffee products after dry milling, as used in Baho's dry mill reports.
# (code, name, display order, counts towards HG out-turn)
GRADES = [
    ("17PLUS", "17+", 1, True),
    ("15PLUS", "15+", 2, True),
    ("GTR15", "GTR 15+", 3, False),
    ("CRS15", "CRS 15+", 4, False),
    ("1314", "13/14", 5, False),
    ("1314GTR", "13/14 - GTR", 6, False),
    ("1314CRS", "13/14 - CRS", 7, False),
    ("CHIPS", "Chips", 8, False),
    ("INKUBURANO", "Inkuburano", 9, False),
]


def seed(apps, schema_editor):
    ExportGrade = apps.get_model("drymill", "ExportGrade")
    for code, name, order, high in GRADES:
        ExportGrade.objects.update_or_create(
            code=code, defaults={"name": name, "display_order": order, "is_high_grade": high}
        )


class Migration(migrations.Migration):
    dependencies = [("drymill", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
