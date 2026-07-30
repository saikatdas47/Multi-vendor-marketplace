"""Raise monthly platform fee invoices.

    python manage.py generate_invoices              # bill last month
    python manage.py generate_invoices --month 2026-06

Safe to run repeatedly and safe to schedule: the (seller, period) unique
constraint means a second run creates nothing.
"""

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from billing.services import generate_invoices


class Command(BaseCommand):
    help = "Generate monthly platform fee invoices for approved sellers."

    def add_arguments(self, parser):
        parser.add_argument(
            "--month",
            help="Billing period as YYYY-MM. Defaults to last month.",
        )

    def handle(self, *args, **options):
        explicit = None
        if options["month"]:
            try:
                explicit = datetime.strptime(options["month"], "%Y-%m").date()
            except ValueError as exc:
                raise CommandError("--month must look like 2026-06.") from exc

        period, created, skipped = generate_invoices(explicit)

        self.stdout.write(
            self.style.SUCCESS(
                f"{period:%B %Y}: {created} invoice(s) created, {skipped} already existed."
            )
        )
