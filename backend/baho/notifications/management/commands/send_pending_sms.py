from django.core.management.base import BaseCommand

from baho.notifications.services import MAX_ATTEMPTS, retry_failed


class Command(BaseCommand):
    help = "Send queued SMS and retry failed ones that have fewer than --max-attempts attempts."

    def add_arguments(self, parser):
        parser.add_argument("--max-attempts", type=int, default=MAX_ATTEMPTS)
        parser.add_argument("--limit", type=int, default=None)

    def handle(self, *args, max_attempts, limit, **options):
        counts = retry_failed(max_attempts=max_attempts, limit=limit)
        self.stdout.write(f"SMS sent: {counts['sent']}, failed: {counts['failed']}")
