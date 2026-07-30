"""Billing tests.

Two things matter here and nothing else does: that generation cannot double-bill,
and that an invoice can only move through the states it is supposed to. Both are
the kind of thing that looks fine in a demo and produces duplicate charges in
week three.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog, SellerProfile

from .models import Invoice
from .services import (
    InvoiceStateError,
    confirm_payment,
    generate_invoices,
    period_start,
    previous_period,
    submit_payment,
    waive,
)

User = get_user_model()

NO_THROTTLE = {
    "DEFAULT_THROTTLE_RATES": {"anon": None, "user": None, "email": None, "ai": None}
}


def make_seller(email, status_=SellerProfile.Status.APPROVED):
    user = User.objects.create_user(
        email=email, password="Str0ngPass!23", role=User.Role.SELLER
    )
    return SellerProfile.objects.create(
        user=user,
        shop_name=f"Shop {email.split('@')[0]}",
        slug=email.split("@")[0],
        status=status_,
        approved_at=timezone.now() if status_ == SellerProfile.Status.APPROVED else None,
    )


class InvoiceGenerationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.approved = make_seller("gen-approved@example.com")
        cls.pending = make_seller("gen-pending@example.com", SellerProfile.Status.PENDING)
        cls.rejected = make_seller("gen-rejected@example.com", SellerProfile.Status.REJECTED)

    def test_only_approved_shops_are_billed(self):
        _, created, _ = generate_invoices()
        self.assertEqual(created, 1)
        self.assertEqual(
            list(Invoice.objects.values_list("seller_id", flat=True)), [self.approved.pk]
        )

    def test_generation_is_idempotent(self):
        """The whole point of the (seller, period) unique constraint.

        A cron that fires twice, or an admin who clicks the button again, must
        not produce a second charge.
        """
        period, first, _ = generate_invoices()
        _, second, skipped = generate_invoices()

        self.assertEqual(first, 1)
        self.assertEqual(second, 0)
        self.assertEqual(skipped, 1)
        self.assertEqual(Invoice.objects.filter(period=period).count(), 1)

    def test_bills_in_arrears(self):
        period, _, _ = generate_invoices()
        self.assertEqual(period, previous_period())
        self.assertLess(period, date.today().replace(day=1))

    def test_amount_is_snapshotted_not_recomputed(self):
        """Raising the platform fee must not reprice invoices already issued.

        Re-reading the same row proves nothing — `amount` is a column, so of
        course it survives a refresh. The real question is whether a *later*
        invoice picks up the new fee while the earlier one keeps the old, so
        two periods are billed at two different prices.
        """
        with override_settings(PLATFORM_MONTHLY_FEE=Decimal("29.00")):
            first_period, _, _ = generate_invoices()

        earlier = period_start(first_period - timedelta(days=1))
        with override_settings(PLATFORM_MONTHLY_FEE=Decimal("99.00")):
            generate_invoices(earlier)

        self.assertEqual(
            Invoice.objects.get(period=first_period).amount,
            Decimal("29.00"),
            "an issued invoice must keep the fee it was raised at",
        )
        self.assertEqual(
            Invoice.objects.get(period=earlier).amount,
            Decimal("99.00"),
            "a newly raised invoice must use the current fee",
        )

    def test_rerun_bills_shops_approved_since_the_last_run(self):
        """Re-running fills gaps; it does not duplicate.

        Named for what it actually asserts. A shop approved after the first run
        does get billed for that period on a re-run — which is the desired
        behaviour, and is safe precisely because existing rows are skipped.
        """
        generate_invoices()
        make_seller("gen-latecomer@example.com")

        _, created, skipped = generate_invoices()
        self.assertEqual(created, 1, "the new shop should be picked up")
        self.assertEqual(skipped, 1, "the existing invoice must not be re-raised")
        self.assertEqual(Invoice.objects.count(), 2)


class InvoiceTransitionTests(APITestCase):
    def setUp(self):
        self.seller = make_seller("txn-seller@example.com")
        self.admin = User.objects.create_user(
            email="txn-admin@example.com", password="Str0ngPass!23", role=User.Role.ADMIN
        )
        generate_invoices()
        self.invoice = Invoice.objects.get()

    def test_submit_then_confirm(self):
        submit_payment(self.invoice, reference="TRX-1001")
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.SUBMITTED)
        self.assertIsNotNone(self.invoice.submitted_at)

        confirm_payment(self.invoice, actor=self.admin)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PAID)
        self.assertEqual(self.invoice.confirmed_by, self.admin)
        self.assertIsNotNone(self.invoice.paid_at)

    def test_settled_invoices_reject_further_payment(self):
        confirm_payment(self.invoice, actor=self.admin)
        with self.assertRaises(InvoiceStateError):
            submit_payment(self.invoice, reference="TRX-2002")

    def test_paid_invoice_cannot_be_waived(self):
        confirm_payment(self.invoice, actor=self.admin)
        with self.assertRaises(InvoiceStateError):
            waive(self.invoice, actor=self.admin)

    def test_transitions_are_audited(self):
        # The label is "billing.Invoice", not "Invoice" — asserting the wrong
        # string here would pass vacuously against an empty queryset, so the
        # exact value and the row count are both checked.
        confirm_payment(self.invoice, actor=self.admin, note="bank transfer")
        logs = AuditLog.objects.filter(
            target_model="billing.Invoice", target_id=str(self.invoice.pk)
        )
        self.assertEqual(logs.count(), 1, "money changing state must be audited once")
        self.assertEqual(logs.first().changes["status"], "paid")
        self.assertEqual(logs.first().actor, self.admin)

    def test_submitted_is_not_overdue(self):
        """A seller who has paid is waiting on us, not the other way round."""
        self.invoice.due_date = date.today() - timedelta(days=5)
        self.invoice.save(update_fields=["due_date"])
        self.assertTrue(self.invoice.is_overdue)

        submit_payment(self.invoice, reference="TRX-3003")
        self.invoice.refresh_from_db()
        self.assertFalse(
            self.invoice.is_overdue,
            "a submitted payment must not be blamed on the seller",
        )


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class InvoiceScopingTests(APITestCase):
    """A seller must never see another shop's billing."""

    def setUp(self):
        self.mine = make_seller("scope-mine@example.com")
        self.theirs = make_seller("scope-theirs@example.com")
        generate_invoices()

    def test_seller_sees_only_their_own_invoices(self):
        self.client.force_authenticate(user=self.mine.user)
        response = self.client.get("/api/v1/seller/invoices/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        body = response.json()
        rows = body if isinstance(body, list) else body.get("results", [])
        self.assertEqual(len(rows), 1)

        other = Invoice.objects.get(seller=self.theirs)
        self.assertNotIn(str(other.id), [row["id"] for row in rows])

    def test_seller_cannot_pay_another_shops_invoice(self):
        other = Invoice.objects.get(seller=self.theirs)
        self.client.force_authenticate(user=self.mine.user)
        response = self.client.post(
            f"/api/v1/seller/invoices/{other.id}/pay/",
            {"payment_reference": "TRX-9999"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
