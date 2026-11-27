"""'Other expenses': anything that fits none of the station categories."""

from django.db import migrations


def add_other(apps, schema_editor):
    Category = apps.get_model("finance", "ExpenseCategory")
    Category.objects.update_or_create(
        code="OTHER",
        defaults={
            "name": "Other expenses",
            "description": "Anything not in the list above: describe exactly what was paid for",
            "display_order": 99,
        },
    )


class Migration(migrations.Migration):
    dependencies = [("finance", "0002_expense_categories")]

    operations = [migrations.RunPython(add_other, migrations.RunPython.noop)]
