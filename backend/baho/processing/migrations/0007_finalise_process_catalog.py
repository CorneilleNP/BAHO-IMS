"""Step 3 of 4: make the catalogue link required and drop the old per-station
grade relation. The old unique constraint on processgrade is tied to the column
being dropped, so it must go first; the new ones are added separately in 0008
(see 0005/0006 for why that can't share a transaction with a column drop here)."""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("processing", "0006_backfill_process_catalog")]

    operations = [
        migrations.RemoveConstraint(model_name="processgrade", name="grade_unique_per_process"),
        migrations.RemoveField(model_name="processgrade", name="process_type"),
        migrations.AlterField(
            model_name="processgrade",
            name="process",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="grades",
                to="processing.process",
            ),
        ),
        migrations.AlterField(
            model_name="processtype",
            name="process",
            field=models.ForeignKey(
                help_text="One of the 5 company-wide processes.",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="process_types",
                to="processing.process",
            ),
        ),
        migrations.RemoveConstraint(
            model_name="processtype", name="process_type_unique_per_station"
        ),
    ]
