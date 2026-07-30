from datetime import timedelta

from django.db.models import (
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Q,
    Sum,
)
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AuditLog
from accounts.services import log_action
from core.permissions import IsAdmin, IsApprovedSeller, IsCustomer

from .models import Order, OrderItem, OrderStatus, PaymentStatus
from .serializers import (
    CancelOrderSerializer,
    CheckoutSerializer,
    ItemStatusSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    SellerOrderItemSerializer,
)
from .services import cancel_order, place_order, transition_item


@extend_schema(
    tags=["orders"],
    summary="Place an order from the current cart",
    description=(
        "Validates availability, deducts stock inside a single locked "
        "transaction, and empties the cart. Returns the created order."
    ),
    request=CheckoutSerializer,
    responses={201: OrderDetailSerializer},
)
class CheckoutView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        order = place_order(
            user=request.user,
            address=serializer.validated_data["address"],
            payment_method=serializer.validated_data["payment_method"],
            customer_note=serializer.validated_data.get("customer_note", ""),
            request=request,
        )
        log_action(
            request,
            AuditLog.Action.CREATE,
            order,
            {"number": order.number, "total": str(order.total)},
        )
        return Response(
            OrderDetailSerializer(order, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    list=extend_schema(
        tags=["orders"],
        summary="My order history",
        parameters=[OpenApiParameter("status", str), OpenApiParameter("q", str)],
    ),
    retrieve=extend_schema(tags=["orders"], summary="Order detail with tracking timeline"),
)
class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsCustomer]
    lookup_field = "number"

    def get_serializer_class(self):
        return OrderListSerializer if self.action == "list" else OrderDetailSerializer

    def get_queryset(self):
        qs = (
            Order.objects.filter(customer=self.request.user)
            .prefetch_related("items", "events")
        )
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(number__icontains=q) | Q(items__product_name__icontains=q)
            ).distinct()
        return qs

    @extend_schema(
        tags=["orders"],
        summary="Cancel an order",
        request=CancelOrderSerializer,
        responses={200: OrderDetailSerializer},
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, number=None):
        order = self.get_object()
        serializer = CancelOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cancel_order(
            order,
            actor=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        order.refresh_from_db()
        log_action(request, AuditLog.Action.UPDATE, order, {"status": "cancelled"})
        return Response(
            OrderDetailSerializer(order, context={"request": request}).data
        )


@extend_schema_view(
    list=extend_schema(
        tags=["seller"],
        summary="Order lines for my products",
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("q", str, description="Order number or product name."),
        ],
    )
)
class SellerOrderItemViewSet(viewsets.ReadOnlyModelViewSet):
    """A seller sees only their own lines, never the whole order."""

    serializer_class = SellerOrderItemSerializer
    permission_classes = [IsApprovedSeller]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = OrderItem.objects.filter(
            seller__user=self.request.user
        ).select_related("order", "product")

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(order__number__icontains=q) | Q(product_name__icontains=q)
            )
        return qs

    @extend_schema(
        tags=["seller"],
        summary="Advance a line's fulfilment status",
        request=ItemStatusSerializer,
        responses={200: SellerOrderItemSerializer},
    )
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        item = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = ItemStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item = transition_item(
            item,
            serializer.validated_data["status"],
            actor=request.user,
            note=serializer.validated_data.get("note", ""),
            tracking_number=serializer.validated_data.get("tracking_number"),
        )
        log_action(
            request, AuditLog.Action.UPDATE, item, {"status": item.status}
        )
        return Response(SellerOrderItemSerializer(item).data)

    @extend_schema(tags=["seller"], summary="Fulfilment counts, revenue and daily sales")
    @action(detail=False, methods=["get"])
    def summary(self, request):
        base = OrderItem.objects.filter(seller__user=request.user)

        # One grouped query for every status count instead of one query per
        # choice. With eight statuses that was eight round trips per dashboard
        # load.
        tallies = dict(
            base.values_list("status").annotate(n=Count("id")).values_list("status", "n")
        )
        counts = {choice: tallies.get(choice, 0) for choice, _ in OrderStatus.choices}

        earning = base.exclude(
            status__in=[OrderStatus.CANCELLED, OrderStatus.REFUNDED]
        )

        # unit_price * quantity, not unit_price.
        #
        # This was `Sum("unit_price")`, which ignored quantity entirely — an item
        # sold at $10 x 3 reported $10. Every seller's revenue was understated by
        # however much they sold in multiples.
        line_total = ExpressionWrapper(
            F("unit_price") * F("quantity"), output_field=DecimalField(max_digits=14, decimal_places=2)
        )
        revenue = earning.aggregate(total=Sum(line_total)).get("total") or 0
        delivered_revenue = (
            earning.filter(status=OrderStatus.DELIVERED)
            .aggregate(total=Sum(line_total))
            .get("total")
            or 0
        )
        units = earning.aggregate(n=Sum("quantity")).get("n") or 0

        # Distinct customers, via the parent order.
        customers = earning.values("order__customer_id").distinct().count()

        # --- daily series for the dashboard chart -------------------------
        # Grouped in the database and zero-filled in Python: the query returns
        # only days that had sales, and a chart with gaps misreads as a dip.
        window_days = 30
        since = timezone.localdate() - timedelta(days=window_days - 1)
        rows = (
            earning.filter(order__placed_at__date__gte=since)
            .annotate(day=TruncDate("order__placed_at"))
            .values("day")
            .annotate(total=Sum(line_total), orders=Count("order_id", distinct=True))
            .order_by("day")
        )
        by_day = {r["day"]: r for r in rows}
        daily = []
        for offset in range(window_days):
            day = since + timedelta(days=offset)
            row = by_day.get(day)
            daily.append(
                {
                    "date": day.isoformat(),
                    "revenue": row["total"] if row else 0,
                    "orders": row["orders"] if row else 0,
                }
            )

        return Response(
            {
                "counts": counts,
                "needs_action": counts[OrderStatus.PENDING] + counts[OrderStatus.CONFIRMED],
                "gross_revenue": revenue,
                "delivered_revenue": delivered_revenue,
                "units_sold": units,
                "customers": customers,
                "daily": daily,
            }
        )


@extend_schema_view(
    list=extend_schema(tags=["admin"], summary="Monitor all orders"),
    retrieve=extend_schema(tags=["admin"], summary="Order detail"),
)
class AdminOrderViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdmin]
    lookup_field = "number"
    queryset = Order.objects.prefetch_related("items", "events").all()

    def get_serializer_class(self):
        return OrderListSerializer if self.action == "list" else OrderDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        payment = self.request.query_params.get("payment_status")
        if payment:
            qs = qs.filter(payment_status=payment)
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(number__icontains=q) | Q(customer_email__icontains=q)
            )
        return qs

    @extend_schema(tags=["admin"], summary="Mark an order paid")
    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, number=None):
        order = self.get_object()
        order.payment_status = PaymentStatus.PAID
        order.save(update_fields=["payment_status", "updated_at"])
        log_action(request, AuditLog.Action.UPDATE, order, {"payment_status": "paid"})
        return Response(
            OrderDetailSerializer(order, context={"request": request}).data
        )

    @extend_schema(tags=["admin"], summary="Revenue and volume overview")
    @action(detail=False, methods=["get"])
    def stats(self, request):
        live = Order.objects.exclude(
            status__in=[OrderStatus.CANCELLED, OrderStatus.REFUNDED]
        )
        return Response(
            {
                "orders_total": Order.objects.count(),
                "orders_live": live.count(),
                "revenue": live.aggregate(total=Sum("total")).get("total") or 0,
                "unpaid": Order.objects.filter(
                    payment_status=PaymentStatus.UNPAID
                ).count(),
                "by_status": {
                    choice: Order.objects.filter(status=choice).count()
                    for choice, _ in OrderStatus.choices
                },
            }
        )
