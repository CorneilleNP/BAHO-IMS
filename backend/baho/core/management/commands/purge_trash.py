from django.core.management.base import BaseCommand

from baho.core.services import purge_trash
from baho.core.trash import TRASH_TYPES_BY_CODE, retention_hours


class Command(BaseCommand):
    help = "Permanently delete records that have been in the trash longer than the retention."

    def handle(self, *args, **options):
        report = purge_trash()
        self.stdout.write(f"Trash retention: {retention_hours():g} hours")
        for code, counts in report.items():
            self.stdout.write(
                f"{TRASH_TYPES_BY_CODE[code].label}: {counts['purged']} purged, "
                f"{counts['skipped']} kept"
            )
        purged = sum(c["purged"] for c in report.values())
        skipped = sum(c["skipped"] for c in report.values())
        self.stdout.write(self.style.SUCCESS(f"Total: {purged} purged, {skipped} kept"))
