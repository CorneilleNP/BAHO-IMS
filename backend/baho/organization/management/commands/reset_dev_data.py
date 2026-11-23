"""Delete everything registered through the app and restart numbering (DEV ONLY).

Keeps users, roles, facilities, crop years, export grades, the 5 processes and the seeded
Gitoki Fully Washed process; then re-runs seed_dev so the setup is complete.

    python manage.py reset_dev_data --yes
"""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from baho.core.models import SequenceCounter
from baho.drymill.models import (
    DryMillBatch,
    DryMillBatchInput,
    HqStockReceipt,
    StockAdjustment,
    Supplier,
)
from baho.farmers.models import Farmer
from baho.labor.models import CasualLaborer, LaborAttendance, LaborPayPeriod
from baho.notifications.models import SmsMessage
from baho.processing.models import ProcessingLot, ProcessType, SubProcess
from baho.reception.models import CherryReceipt
from baho.sales.models import Client, ExportShipment


class Command(BaseCommand):
    help = "Wipe all registered records (receipts, lots, stock, labor, SMS…). DEV ONLY."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Confirm the deletion")

    def handle(self, *args, yes, **options):
        if not settings.DEBUG:
            raise CommandError("reset_dev_data only runs with DEBUG=true.")
        if not yes:
            raise CommandError("This deletes all registered records. Re-run with --yes to confirm.")

        with transaction.atomic():
            counts = {
                "shipments": ExportShipment.all_objects.all().delete()[0],
                "clients": Client.objects.all().delete()[0],
                "batch inputs": DryMillBatchInput.objects.all().delete()[0],
                "dry mill batches": DryMillBatch.all_objects.all().delete()[0],
                "stock adjustments": StockAdjustment.objects.all().delete()[0],
                "stock receipts": HqStockReceipt.all_objects.all().delete()[0],
                "receipt history": HqStockReceipt.history.all().delete()[0],
                "batch history": DryMillBatch.history.all().delete()[0],
                "sub-processes": SubProcess.objects.all().delete()[0],
                "suppliers": Supplier.objects.all().delete()[0],
                "processing lots": ProcessingLot.all_objects.all().delete()[0],
                "labor attendance": LaborAttendance.all_objects.all().delete()[0],
                "labor pay periods": LaborPayPeriod.all_objects.all().delete()[0],
                "casual laborers": CasualLaborer.all_objects.all().delete()[0],
                "sms messages": SmsMessage.objects.all().delete()[0],
                "cherry receipts": CherryReceipt.all_objects.all().delete()[0],
                "farmers": Farmer.all_objects.all().delete()[0],
                "processes": ProcessType.objects.all().delete()[0],
                "number counters": SequenceCounter.objects.all().delete()[0],
            }
        for label, count in counts.items():
            self.stdout.write(f"  deleted {count:>5} rows ({label})")
        call_command("seed_dev", stdout=self.stdout)
