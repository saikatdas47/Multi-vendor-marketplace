"""Orders.

Two design decisions worth explaining:

**Everything is snapshotted.** An order line stores the product name, SKU and
price as they were at purchase time. If the seller later renames the product,
raises the price or deletes it, historical orders and invoices stay accurate.
This is why `product` is nullable with `SET_NULL` rather than `CASCADE` - a
deleted product must never take order history with it.

**Fulfilment is per item, not per order.** A multi-vendor cart produces one
order containing items from several sellers, and each seller ships independently.
So each `OrderItem` carries its own status, and the order's overall status is
derived from its items.
"""

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.translation import gettext_lazy as _

from accounts.models import SellerProfile
from core.models import TimeStampedModel, UUIDModel
from products.models import Product, ProductVariant


def generate_order_number():
    """Human-quotable, non-sequential: CX-20260725-A7K2QX.

    Sequential numbers leak order volume to anyone who places two orders.
    """
    stamp = timezone.now().strftime("%Y%m%d")
    for _attempt in range(10):
        candidate = f"CX-{stamp}-{get_random_string(6).upper()}"
        if not Order.objects.filter(number=candidate).exists():
            return candidate
    raise RuntimeError("Could not generate a unique order number")


class OrderStatus(models.TextChoices):
    PENDING = "pending", _("Pending")
    CONFIRMED = "confirmed", _("Confirmed")
    PACKED = "packed", _("Packed")
    SHIPPED = "shipped", _("Shipped")
    OUT_FOR_DELIVERY = "out_for_delivery", _("Out for delivery")
    DELIVERED = "delivered", _("Delivered")
    COMPLETED = "completed", _("Completed")
    CANCELLED = "cancelled", _("Cancelled")
    REFUNDED = "refunded", _("Refunded")


# The only transitions the API will accept. Anything else is a 400 rather than
# a silently corrupted order.
ALLOWED_TRANSITIONS = {
    OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.PACKED, OrderStatus.CANCELLED},
    OrderStatus.PACKED: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: {OrderStatus.COMPLETED, OrderStatus.REFUNDED},
    OrderStatus.COMPLETED: {OrderStatus.REFUNDED},
    OrderStatus.CANCELLED: set(),
    OrderStatus.REFUNDED: set(),
}

# Statuses at which stock has already left the warehouse conceptually; once
# reached, a customer can no longer cancel unilaterally.
CUSTOMER_CANCELLABLE = {OrderStatus.PENDING, OrderStatus.CONFIRMED}

# Statuses that release reserved stock back to the product.
STOCK_RELEASING = {OrderStatus.CANCELLED, OrderStatus.REFUNDED}


class PaymentStatus(models.TextChoices):
    UNPAID = "unpaid", _("Unpaid")
    PAID = "paid", _("Paid")
    FAILED = "failed", _("Failed")
    REFUNDED = "refunded", _("Refunded")


class PaymentMethod(models.TextChoices):
    CASH_ON_DELIVERY = "cod", _("Cash on delivery")
    CARD = "card", _("Card")


class Order(UUIDModel, TimeStampedModel):
    number = models.CharField(
        max_length=32, unique=True, default=generate_order_number, editable=False
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="orders",
    )
    # Kept even if the account is deleted, so revenue reporting survives.
    customer_email = models.EmailField()

    status = models.CharField(
        max_length=20,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
        db_index=True,
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True,
    )
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH_ON_DELIVERY
    )
    payment_reference = models.CharField(max_length=120, blank=True)

    # Shipping address is copied, not referenced: editing a saved address later
    # must not rewrite where a past order was delivered.
    ship_to_name = models.CharField(max_length=150)
    ship_to_phone = models.CharField(max_length=20)
    ship_to_line1 = models.CharField(max_length=255)
    ship_to_line2 = models.CharField(max_length=255, blank=True)
    ship_to_city = models.CharField(max_length=100)
    ship_to_state = models.CharField(max_length=100, blank=True)
    ship_to_postal_code = models.CharField(max_length=20)
    ship_to_country = models.CharField(max_length=100)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    customer_note = models.TextField(blank=True)
    cancel_reason = models.TextField(blank=True)
    placed_at = models.DateTimeField(default=timezone.now, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "orders_order"
        ordering = ["-placed_at"]
        indexes = [
            models.Index(fields=["customer", "-placed_at"]),
            models.Index(fields=["status", "-placed_at"]),
        ]

    def __str__(self):
        return self.number

    @property
    def item_count(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def seller_names(self):
        return sorted({item.seller_name for item in self.items.all()})

    @property
    def can_customer_cancel(self):
        return self.status in CUSTOMER_CANCELLABLE

    def recalculate_totals(self, save=True):
        self.subtotal = sum(
            (item.line_total for item in self.items.all()), Decimal("0.00")
        )
        self.total = self.subtotal + self.shipping_fee + self.tax - self.discount
        if save:
            self.save(update_fields=["subtotal", "total", "updated_at"])
        return self.total

    def sync_status_from_items(self, save=True):
        """Order status is the least-advanced live item.

        A customer sees "shipped" only once every seller has shipped; until then
        the order honestly reads as the slowest package.
        """
        statuses = list(self.items.values_list("status", flat=True))
        if not statuses:
            return self.status

        live = [s for s in statuses if s not in STOCK_RELEASING]
        if not live:
            # Everything was cancelled or refunded.
            new_status = (
                OrderStatus.REFUNDED
                if OrderStatus.REFUNDED in statuses
                else OrderStatus.CANCELLED
            )
        else:
            order = list(OrderStatus)
            rank = {s: i for i, s in enumerate(order)}
            new_status = min(live, key=lambda s: rank[s])

        if new_status != self.status:
            self.status = new_status
            if new_status == OrderStatus.DELIVERED and not self.delivered_at:
                self.delivered_at = timezone.now()
            if save:
                self.save(update_fields=["status", "delivered_at", "updated_at"])
        return self.status


class OrderItem(UUIDModel, TimeStampedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        Product, on_delete=models.SET_NULL, null=True, blank=True, related_name="order_items"
    )
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_items",
    )
    seller = models.ForeignKey(
        SellerProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_items",
    )

    # --- snapshots, immutable after purchase -------------------------------
    product_name = models.CharField(max_length=200)
    product_sku = models.CharField(max_length=64)
    product_slug = models.SlugField(max_length=230, blank=True)
    variant_label = models.CharField(max_length=120, blank=True)
    seller_name = models.CharField(max_length=150)
    unit_price = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    image_url = models.CharField(max_length=500, blank=True)

    status = models.CharField(
        max_length=20,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
        db_index=True,
    )
    tracking_number = models.CharField(max_length=120, blank=True)
    stock_released = models.BooleanField(
        default=False,
        help_text="True once this line's stock has been returned to inventory.",
    )

    class Meta:
        db_table = "orders_order_item"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["order", "status"]),
            models.Index(fields=["seller", "status"]),
        ]

    def __str__(self):
        return f"{self.quantity} x {self.product_name}"

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    def can_transition_to(self, new_status):
        return new_status in ALLOWED_TRANSITIONS.get(self.status, set())


class OrderEvent(models.Model):
    """Append-only timeline shown to the customer as order tracking."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    item = models.ForeignKey(
        OrderItem, on_delete=models.CASCADE, null=True, blank=True, related_name="events"
    )
    status = models.CharField(max_length=20, choices=OrderStatus.choices)
    note = models.CharField(max_length=255, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_events",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "orders_order_event"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.order.number}: {self.status}"
