"""Seller sees its own invoices; admin sees everyone's.

Two viewsets, two permission classes, two querysets. A single viewset that
widened its queryset for admins would be one `if` away from showing a seller
another shop's billing.
"""

from datetime import date

from django.db.models import Count, Q, Sum
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.permissions import IsAdmin, IsSeller

from .models import Invoice
from .serializers import (
    AdminInvoiceSerializer,
    ConfirmPaymentSerializer,
    GenerateInvoicesSerializer,
    InvoiceSerializer,
    SubmitPaymentSerializer,
)
from .services import (
    InvoiceStateError,
    confirm_payment,
    generate_invoices,
    submit_payment,
    waive,
)


def _outstanding(queryset):
    """Totals used by both dashboards. One query, not three."""
    agg = queryset.aggregate(
        due=Sum("amount", filter=Q(status=Invoice.Status.DUE)),
        submitted=Sum("amount", filter=Q(status=Invoice.Status.SUBMITTED)),
        paid=Sum("amount", filter=Q(status=Invoice.Status.PAID)),
        waived=Sum("amount", filter=Q(status=Invoice.Status.WAIVED)),
        overdue=Count(
            "id",
            filter=Q(status=Invoice.Status.DUE, due_date__lt=date.today()),
        ),
    )
    return {k: (v or 0) for k, v in agg.items()}


@extend_schema_view(
    list=extend_schema(tags=["seller"], summary="My platform fee invoices"),
)
class SellerInvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    # IsSeller, not IsApprovedSeller: a suspended shop still owes what it owes,
    # and locking them out of the payment screen would make the debt unpayable.
    permission_classes = [IsSeller]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        profile = getattr(self.request.user, "seller_profile", None)
        if profile is None:
            return Invoice.objects.none()
        return Invoice.objects.filter(seller=profile).select_related("seller")

    @extend_schema(tags=["seller"], summary="Fee summary for my shop")
    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self.get_queryset()
        totals = _outstanding(qs)
        next_due = (
            qs.filter(status__in=[Invoice.Status.DUE, Invoice.Status.SUBMITTED])
            .order_by("due_date")
            .first()
        )
        return Response(
            {
                **totals,
                "outstanding": totals["due"] + totals["submitted"],
                "next_due": InvoiceSerializer(next_due).data if next_due else None,
            }
        )

    @extend_schema(
        tags=["seller"],
        summary="Declare that an invoice has been paid",
        request=SubmitPaymentSerializer,
    )
    @action(detail=True, methods=["post"], url_path="pay")
    def pay(self, request, pk=None):
        invoice = self.get_object()
        form = SubmitPaymentSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        try:
            submit_payment(invoice, reference=form.validated_data["payment_reference"])
        except InvoiceStateError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(InvoiceSerializer(invoice).data)


@extend_schema_view(
    list=extend_schema(tags=["admin"], summary="Platform fee invoices"),
)
class AdminInvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = AdminInvoiceSerializer

    def get_queryset(self):
        qs = Invoice.objects.select_related("seller", "seller__user")
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        seller_param = self.request.query_params.get("seller")
        if seller_param:
            qs = qs.filter(seller_id=seller_param)
        return qs

    @extend_schema(tags=["admin"], summary="Fee collection summary")
    @action(detail=False, methods=["get"])
    def summary(self, request):
        # Deliberately unfiltered: the summary describes the whole platform, so
        # it must not silently inherit the list's ?status= filter.
        totals = _outstanding(Invoice.objects.all())
        return Response({**totals, "outstanding": totals["due"] + totals["submitted"]})

    @extend_schema(
        tags=["admin"],
        summary="Raise invoices for a month",
        request=GenerateInvoicesSerializer,
    )
    @action(detail=False, methods=["post"])
    def generate(self, request):
        form = GenerateInvoicesSerializer(data=request.data)
        form.is_valid(raise_exception=True)

        explicit = None
        if "year" in form.validated_data:
            explicit = date(form.validated_data["year"], form.validated_data["month"], 1)

        period, created, skipped = generate_invoices(explicit, actor=request.user)
        return Response(
            {"period": period, "created": created, "already_existed": skipped},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["admin"], summary="Confirm payment received", request=ConfirmPaymentSerializer
    )
    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        invoice = self.get_object()
        form = ConfirmPaymentSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        try:
            confirm_payment(
                invoice, actor=request.user, note=form.validated_data.get("note", "")
            )
        except InvoiceStateError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(AdminInvoiceSerializer(invoice).data)

    @extend_schema(tags=["admin"], summary="Waive an invoice", request=ConfirmPaymentSerializer)
    @action(detail=True, methods=["post"])
    def waive(self, request, pk=None):
        invoice = self.get_object()
        form = ConfirmPaymentSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        try:
            waive(invoice, actor=request.user, note=form.validated_data.get("note", ""))
        except InvoiceStateError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(AdminInvoiceSerializer(invoice).data)
