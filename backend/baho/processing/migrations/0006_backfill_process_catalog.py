"""Step 2 of 4: backfill the new FK columns from the existing free-text labels, and
merge any duplicate grades that land on the same (process, code). Pure data - no
schema change shares this transaction (see 0005)."""

from django.db import migrations


def backfill(apps, schema_editor):
    ProcessType = apps.get_model("processing", "ProcessType")
    ProcessGrade = apps.get_model("processing", "ProcessGrade")
    GradeRatio = apps.get_model("processing", "GradeRatio")
    LotGradeResult = apps.get_model("processing", "LotGradeResult")
    Process = apps.get_model("processing", "Process")
    SubProcess = apps.get_model("processing", "SubProcess")

    processes = list(Process.objects.filter(is_active=True))

    def resolve(label: str):
        import re

        key = re.sub(r"[^A-Z0-9]", "", (label or "").upper())
        if not key:
            return None, None
        for process in processes:
            keys = {
                re.sub(r"[^A-Z0-9]", "", process.code.upper()),
                re.sub(r"[^A-Z0-9]", "", process.name.upper()),
                *process.aliases,
            }
            if key in keys:
                return process, None
        sub = SubProcess.objects.filter(key=key).first()
        return (sub.process if sub else None), sub

    # Resolve each ProcessType to a catalogue process (+ sub-process when its own
    # name doesn't already resolve to the process itself), falling back to the
    # company's first active process so the column is never left empty.
    fallback = processes[0] if processes else None
    for pt in ProcessType.objects.all():
        process, sub = resolve(pt.name)
        if process is None:
            process, sub = resolve(f"{pt.name} {pt.sub_process}".strip())
        pt.process = process or fallback
        pt.sub_process_ref = sub
        pt.save(update_fields=["process", "sub_process_ref"])

    # Move every grade onto its ProcessType's catalogue process, merging duplicates
    # (two stations that both typed "A1" for the same process) into the earliest one.
    groups: dict[tuple, list] = {}
    for grade in ProcessGrade.objects.select_related("process_type").order_by("created_at"):
        process_id = grade.process_type.process_id
        groups.setdefault((process_id, grade.code), []).append(grade)

    for (process_id, _code), grades in groups.items():
        keeper, dupes = grades[0], grades[1:]
        keeper.process_id = process_id
        keeper.save(update_fields=["process"])
        for dup in dupes:
            LotGradeResult.objects.filter(grade=dup).update(grade=keeper)
            GradeRatio.objects.filter(grade=dup).delete()
            dup.delete()


class Migration(migrations.Migration):
    dependencies = [("processing", "0005_link_process_catalog")]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
