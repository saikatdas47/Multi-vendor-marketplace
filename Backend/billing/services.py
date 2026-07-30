"""Invoice generation and state transitions.

Each function is one transaction and one state change, because every transition
here has side effects beyond the row itself — an audit log entry, and in the
admin's case a decision that a seller can see.
"""

from calendar import monthrange
from datetime import date, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import AuditLog, SellerProfile

from .models import Invoice


def period_start(when=None):
    """First day of the month containing `when` (today by default)."""
    today = when or timezone.localdate()
    return date(today.year, today.month, 1)


def previous_period(when=None):
    """First day of the month before `when`.

    Billing runs in arrears, so the invoice raised on 1 March covers February.
    Charging for a month before it has happened would mean refunding any shop
    that gets suspended mid-month.
    """
    start = period_start(when)
    return period_start(start - timedelta(days=1))


@transaction.atomic
def generate_invoices(period=None, *, actor=None):
    """Create one invoice per billable shop for `period`.

    Idempotent by construction: `get_or_create` against the
    (seller, period) unique constraint means running this twice — by cron, by
    hand, or both — cannot double-bill anyone.

    Only APPROVED shops are billed. A pending application has no shop to charge
    for, and billing a rejected or suspended shop would invoice someone who
    cannot trade.

    Returns ``(period, created_count, skipped_count)``.
    """
    period = period or previous_period()
    # Due at the end of the month *after* the billed one, giving a full month to
    # pay rather than an arbitrary number of days.
    grace_month = period_start(period + timedelta(days=31))
    due_date = date(
        grace_month.year,
        grace_month.month,
        monthrange(grace_month.year, grace_month.month)[1],
    )

    sellers = SellerProfile.objects.filter(status=SellerProfile.Status.APPROVED)

    created = 0
    skipped = 0
    for seller in sellers:
        _, was_created = Invoice.objects.get_or_create(
            seller=seller,
            period=period,
            defaults={
                "amount": settings.PLATFORM_MONTHLY_FEE,
                "due_date": due_date,
                "status": Invoice.Status.DUE,
            },
        )
        created += was_created
        skipped += not was_created

    if actor is not None and created:
        AuditLog.objects.create(
            actor=actor,
            action=AuditLog.Action.CREATE,
            target_model="billing.Invoice",
            target_id=str(period),
            changes={"period": str(period), "created": created, "skipped": skipped},
        )

    return period, created, skipped


class InvoiceStateError(Exception):
    """A transition that the invoice's current status does not allow."""


@transaction.atomic
def submit_payment(invoice, *, reference):
    """Seller declares they have paid. Does not settle the invoice."""
    if invoice.is_settled:
        raise InvoiceStateError("This invoice is already settled.")

    invoice.status = Invoice.Status.SUBMITTED
    invoice.payment_reference = reference
    invoice.submitted_at = timezone.now()
    invoice.save(
        update_fields=["status", "payment_reference", "submitted_at", "updated_at"]
    )
    return invoice


@transaction.atomic
def confirm_payment(invoice, *, actor, note=""):
    """Admin confirms receipt.

    Allowed from DUE as well as SUBMITTED: money sometimes arrives without the
    seller ever pressing the button, and forcing the admin to wait for a
    declaration they can already see in the bank would be theatre.
    """
    if invoice.is_settled:
        raise InvoiceStateError("This invoice is already settled.")

    invoice.status = Invoice.Status.PAID
    invoice.paid_at = timezone.now()
    invoice.confirmed_by = actor
    invoice.note = note
    invoice.save(
        update_fields=["status", "paid_at", "confirmed_by", "note", "updated_at"]
    )

    AuditLog.objects.create(
        actor=actor,
        action=AuditLog.Action.UPDATE,
        target_model="billing.Invoice",
        target_id=str(invoice.pk),
        changes={"status": "paid", "amount": str(invoice.amount)},
    )
    return invoice


@transaction.atomic
def waive(invoice, *, actor, note=""):
    """Write the invoice off. Distinct from PAID so reporting stays truthful —
    revenue collected and revenue forgiven are not the same number."""
    if invoice.status == Invoice.Status.PAID:
        raise InvoiceStateError("A paid invoice cannot be waived.")

    invoice.status = Invoice.Status.WAIVED
    invoice.confirmed_by = actor
    invoice.note = note
    invoice.save(update_fields=["status", "confirmed_by", "note", "updated_at"])

    AuditLog.objects.create(
        actor=actor,
        action=AuditLog.Action.UPDATE,
        target_model="billing.Invoice",
        target_id=str(invoice.pk),
        changes={"status": "waived", "amount": str(invoice.amount), "note": note},
    )
    return invoice
