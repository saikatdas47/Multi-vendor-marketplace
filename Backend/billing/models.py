"""Monthly platform fee invoices.

A flat fee per shop per month, invoiced in arrears. Deliberately not a
commission on sales: the fee is decided by the platform, not derived from
order data, so an invoice's amount is *stored* rather than recomputed. If the
fee changes next month, last month's invoice must not change with it — that is
the whole reason `amount` is a column and not a property.

Payment is recorded, not processed. There is no gateway here: the seller
declares a reference and an admin confirms receipt. That keeps the flow honest
about what it is instead of pretending to take money.
"""

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel, UUIDModel


def default_monthly_fee():
    return settings.PLATFORM_MONTHLY_FEE


class Invoice(UUIDModel, TimeStampedModel):
    class Status(models.TextChoices):
        DUE = "due", "Due"
        # Seller says they paid; the platform has not verified it.
        SUBMITTED = "submitted", "Payment submitted"
        PAID = "paid", "Paid"
        WAIVED = "waived", "Waived"

    seller = models.ForeignKey(
        "accounts.SellerProfile", on_delete=models.CASCADE, related_name="invoices"
    )
    # Stored as the first day of the billed month. A DateField rather than
    # separate year/month ints so ordering, ranges and `__year` lookups all work
    # without special handling.
    period = models.DateField(help_text="First day of the billed month.")
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=default_monthly_fee,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Snapshotted at generation; changing the platform fee never "
        "rewrites an issued invoice.",
    )
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.DUE, db_index=True
    )
    due_date = models.DateField()

    # --- payment declaration (seller) ---
    payment_reference = models.CharField(
        max_length=120, blank=True, help_text="Transfer reference the seller quoted."
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    # --- confirmation (admin) ---
    paid_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_invoices",
    )
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "billing_invoice"
        ordering = ["-period", "seller__shop_name"]
        constraints = [
            # One invoice per shop per month. This is what makes generation
            # re-runnable: a cron that fires twice cannot double-bill.
            models.UniqueConstraint(
                fields=["seller", "period"], name="uniq_invoice_seller_period"
            )
        ]
        indexes = [
            models.Index(fields=["seller", "-period"]),
            models.Index(fields=["status", "due_date"]),
        ]

    def __str__(self):
        return f"{self.seller.shop_name} — {self.period:%B %Y}"

    @property
    def is_settled(self):
        return self.status in {self.Status.PAID, self.Status.WAIVED}

    @property
    def is_overdue(self):
        # A submitted payment is not overdue: the seller has done their part and
        # is waiting on the platform. Marking it overdue would blame them for the
        # admin's queue.
        return self.status == self.Status.DUE and self.due_date < timezone.localdate()

    @property
    def period_label(self):
        return f"{self.period:%B %Y}"
