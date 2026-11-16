"""Link ProcessType to the shared 5-process catalogue, and move ProcessGrade from
being per-station (per ProcessType) to being shared per catalogue Process - so a
station reuses the same grades another station already registered, and dry mill
reception can source its grade choices from the same place.

Step 1 of 4: add the new FK columns (schema only). The data backfill is a separate
migration (0006): Django defers a new FK column's index creation to the end of this
migration's transaction, and running it after the backfill's own writes to this same
table trips Postgres's "pending trigger events" check on that deferred CREATE INDEX.
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("processing", "0004_seed_processes")]

    operations = [
        migrations.AddField(
            model_name="processtype",
            name="process",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="process_types",
                to="processing.process",
            ),
        ),
        migrations.AddField(
            model_name="processtype",
            name="sub_process_ref",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional catalogue sub-process.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="process_types",
                to="processing.subprocess",
            ),
        ),
        migrations.AddField(
            model_name="processgrade",
            name="process",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="grades",
                to="processing.process",
            ),
        ),
    ]
