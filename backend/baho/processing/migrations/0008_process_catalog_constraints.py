"""Step 4 of 4: add the new shared-catalogue uniqueness constraints, in their own
transaction (see 0005/0007)."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("processing", "0007_finalise_process_catalog")]

    operations = [
        migrations.AddConstraint(
            model_name="processgrade",
            constraint=models.UniqueConstraint(
                fields=["process", "code"], name="grade_unique_per_process"
            ),
        ),
        migrations.AddConstraint(
            model_name="processtype",
            constraint=models.UniqueConstraint(
                fields=["facility", "process", "sub_process_ref"],
                name="process_type_unique_per_station",
            ),
        ),
    ]
