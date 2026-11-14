"""Import the BAHO STOCK UPDATE sheet (CSV) into HQ stock receipts.

    python manage.py import_stock_update "<file>.csv"            # dry run: report only
    python manage.py import_stock_update "<file>.csv" --commit   # write to the database

Safe to run again: rows already imported (same --batch name + sheet row) are skipped.
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from baho.accounts.models import User
from baho.imports.stock_update import import_stock_update


def kg(value) -> str:
    return f"{value:,.2f} kg"


class Command(BaseCommand):
    help = "Import the BAHO STOCK UPDATE sheet (CSV export) into HQ stock receipts."

    def add_arguments(self, parser):
        parser.add_argument("file")
        parser.add_argument("--commit", action="store_true", help="Write to the database")
        parser.add_argument("--batch", default="BAHO STOCK UPDATE", help="Import batch name")
        parser.add_argument("--user", default="", help="Email recorded as creator")

    def handle(self, *args, file, commit, batch, user, **options):
        path = Path(file)
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        creator = User.objects.filter(email=user).first() if user else None
        try:
            r = import_stock_update(path, batch=batch, user=creator, commit=commit)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        w = self.stdout.write
        w(
            self.style.MIGRATE_HEADING(
                ("IMPORT" if commit else "DRY RUN — nothing saved") + f": {path.name}"
            )
        )
        w(f"  rows in file            {r.rows_in_file}")
        w(f"  empty rows skipped      {r.skipped_empty}")
        w(f"  already imported        {r.already_imported}")
        w(self.style.SUCCESS(f"  receipts {'created' if commit else 'to create'}      {r.created}"))
        w(f"  opening adjustments     {r.opening_adjustments}  (rows marked Completed)")
        w("")
        w("  Totals        file            imported")
        checks = [
            ("net", r.imported_totals["net"], 1),
            ("bags", r.imported_totals["bags"], 1),
            # Sheet pure weights are rounded to whole kg: allow 0.5 kg per row.
            ("pure", r.imported_totals["pure_where_sheet_has_it"], max(1, r.created // 2)),
        ]
        for k, imported, tolerance in checks:
            same = abs(r.file_totals[k] - imported) <= tolerance
            line = f"  {k:<6} {kg(r.file_totals[k]):>16} {kg(imported):>18}"
            label = "  OK" if k != "pure" else "  OK (rows with a sheet value; whole-kg rounding)"
            if same or r.already_imported:
                w(self.style.SUCCESS(line + label))
            else:
                w(self.style.WARNING(line + "  DIFFERENT"))
        w(f"  pure weight of all imported receipts (net - bags): {kg(r.imported_totals['pure'])}")
        if r.new_stations:
            w(f"\n  New Baho CWS stations ({len(r.new_stations)}): {', '.join(r.new_stations)}")
        if r.new_suppliers:
            w(f"  New partner suppliers ({len(r.new_suppliers)}): {', '.join(r.new_suppliers)}")
        unassigned = getattr(r, "unassigned_sub_processes", [])
        if unassigned:
            w(f"\n  Sub-processes to assign on the Processes screen ({len(unassigned)}):")
            w("    " + ", ".join(unassigned[:60]) + (" …" if len(unassigned) > 60 else ""))
        for title, items, style in (
            ("Errors (rows NOT imported)", r.errors, self.style.ERROR),
            ("Warnings", r.warnings, self.style.WARNING),
        ):
            if items:
                w("\n" + style(f"  {title}:"))
                for kind, rows in sorted(items.items(), key=lambda x: -len(x[1])):
                    shown = ", ".join(str(n) for n in rows[:12]) + (" …" if len(rows) > 12 else "")
                    w(f"    {len(rows):>4} × {kind}  (sheet rows {shown})")
        if not commit:
            w(self.style.NOTICE("\n  Run again with --commit to save."))
