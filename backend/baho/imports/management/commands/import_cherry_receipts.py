"""Import a CWS "CHERRY RECEIVED" sheet (CSV export) as farmers + cherry GRNs.

    python manage.py import_cherry_receipts "<file>.csv" --station BUGOYI --user me@baho.rw
    python manage.py import_cherry_receipts "<file>.csv" --station BUGOYI --user me@baho.rw --commit

Without --commit nothing is saved (dry run + report). Safe to run again: rows
already imported are skipped. See baho/imports/cherry_receipts.py for the columns.
"""

from collections import defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from baho.accounts.models import User
from baho.imports.cherry_receipts import HEADER_ROWS, import_cherry_receipts


class Command(BaseCommand):
    help = "Import a CWS cherry reception sheet (CSV export) as farmers and cherry GRNs."

    def add_arguments(self, parser):
        parser.add_argument("file")
        parser.add_argument("--station", required=True, help="Station (CWS) code, e.g. BUGOYI")
        parser.add_argument(
            "--user", required=True, help="Email of the user recorded as creator (needs access)"
        )
        parser.add_argument("--commit", action="store_true", help="Write to the database")
        parser.add_argument(
            "--header-rows",
            type=int,
            default=HEADER_ROWS,
            help=f"Title/header lines before the data (default {HEADER_ROWS})",
        )

    def handle(self, *args, file, station, user, commit, header_rows, **options):
        path = Path(file)
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        creator = User.objects.filter(email__iexact=user).first()
        if creator is None:
            raise CommandError(f"No user with email {user!r}.")
        try:
            r = import_cherry_receipts(
                path, station_code=station, user=creator, commit=commit, header_rows=header_rows
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        w = self.stdout.write
        title = "IMPORT" if commit else "DRY RUN — nothing saved"
        w(self.style.MIGRATE_HEADING(f"{title}: {path.name} -> {r.station}"))
        w(f"  rows read               {r.rows_read}")
        w(f"  empty rows skipped      {r.skipped_empty}")
        w(f"  already imported        {r.already_imported}")
        w(f"  rows with errors        {len(r.errors)}")
        verb = "created" if commit else "to create"
        w(self.style.SUCCESS(f"  GRNs {verb:<19}{r.created}"))
        w(f"  farmers {verb:<16}{r.farmers_created}")
        w(f"  rows of known farmers   {r.farmers_matched}")
        w(f"  good cherry             {r.good_kg:,.2f} kg")
        w(f"  float cherry            {r.float_kg:,.2f} kg")
        if r.errors:
            w("\n" + self.style.ERROR("  Errors (rows NOT imported):"))
            for row, reason in r.errors:
                w(f"    row {row:>5}  {reason}")
        if r.warnings:
            grouped = defaultdict(list)
            for row, message in r.warnings:
                grouped[message].append(row)
            w("\n" + self.style.WARNING("  Warnings:"))
            for message, rows in sorted(grouped.items(), key=lambda x: -len(x[1])):
                shown = ", ".join(str(n) for n in rows[:12]) + (" …" if len(rows) > 12 else "")
                w(f"    {len(rows):>4} × {message}  (rows {shown})")
        if not commit:
            w(self.style.NOTICE("\n  Run again with --commit to save."))
