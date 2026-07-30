"""Order business logic, kept out of the views.

The checkout function is the most safety-critical code in the project: it is the
one place where money is committed and inventory permanently leaves the shelf.
Everything happens inside a single transaction, and every product row is locked
with ``select_for_update`` *before* stock is checked, so two customers racing for
the last unit cannot both succeed.
"""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from cart.models import Cart, CartItem
from products.models import Product, ProductVariant

from .models import (
    STOCK_RELEASING,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
)


class CheckoutError(ValidationError):
    """A 400 with a field-shaped body the frontend can render."""


def _image_url(product, request=None):
    image = product.primary_image if product else None
    if not image:
        return ""
    url = image.image.url
    return request.build_absolute_uri(url) if request else url


@transaction.atomic
def place_order(
    *,
    user,
    address,
    payment_method,
    customer_note="",
    shipping_fee=Decimal("0.00"),
    request=None,
):
    """Turns the user's cart into an order and deducts stock.

    Raises CheckoutError (400) rather than partially committing.
    """
    cart = Cart.objects.filter(user=user).first()
    items = (
        list(
            CartItem.objects.filter(cart=cart)
            .select_related("product", "product__seller", "variant")
        )
        if cart
        else []
    )
    if not items:
        raise CheckoutError({"detail": "Your cart is empty."})

    # Lock every product row up front, ordered by pk. Consistent lock ordering
    # is what prevents two concurrent checkouts from deadlocking each other.
    product_ids = sorted({item.product_id for item in items})
    locked = {
        p.pk: p
        for p in Product.all_objects.select_for_update()
        .filter(pk__in=product_ids)
        .select_related("seller")
    }

    variant_ids = sorted({i.variant_id for i in items if i.variant_id})
    locked_variants = {
        v.pk: v
        for v in ProductVariant.objects.select_for_update().filter(pk__in=variant_ids)
    }

    problems = []
    for item in items:
        product = locked.get(item.product_id)
        if product is None or product.deleted_at is not None:
            problems.append(f"{item.product.name} is no longer available.")
            continue
        if product.status != Product.Status.PUBLISHED:
            problems.append(f"{product.name} is no longer for sale.")
            continue

        variant = locked_variants.get(item.variant_id) if item.variant_id else None
        if item.variant_id and (variant is None or not variant.is_active):
            problems.append(f"The selected option for {product.name} is unavailable.")
            continue

        available = variant.stock if variant else product.stock
        if available <= 0:
            problems.append(f"{product.name} is out of stock.")
        elif item.quantity > available:
            problems.append(
                f"Only {available} left of {product.name} (you have {item.quantity})."
            )

    if problems:
        raise CheckoutError({"detail": "Your cart needs attention.", "issues": problems})

    order = Order.objects.create(
        customer=user,
        customer_email=user.email,
        payment_method=payment_method,
        customer_note=customer_note,
        shipping_fee=shipping_fee,
        ship_to_name=address.full_name,
        ship_to_phone=address.phone,
        ship_to_line1=address.line1,
        ship_to_line2=address.line2,
        ship_to_city=address.city,
        ship_to_state=address.state,
        ship_to_postal_code=address.postal_code,
        ship_to_country=address.country,
        placed_at=timezone.now(),
    )

    for item in items:
        product = locked[item.product_id]
        variant = locked_variants.get(item.variant_id) if item.variant_id else None

        # Price is taken live from the locked row, not from the cart snapshot -
        # the cart UI already forced the customer to accept any change.
        unit_price = product.price + (variant.price_delta if variant else Decimal("0.00"))

        OrderItem.objects.create(
            order=order,
            product=product,
            variant=variant,
            seller=product.seller,
            product_name=product.name,
            product_sku=product.sku,
            product_slug=product.slug,
            variant_label=f"{variant.name}: {variant.value}" if variant else "",
            seller_name=product.seller.shop_name if product.seller else "Unknown",
            unit_price=unit_price,
            quantity=item.quantity,
            image_url=_image_url(product, request),
        )

        # Deduct stock on the locked rows.
        if variant:
            variant.stock -= item.quantity
            variant.save(update_fields=["stock"])
        product.stock -= item.quantity
        product.save(update_fields=["stock", "updated_at"])

    order.recalculate_totals()
    OrderEvent.objects.create(
        order=order,
        status=OrderStatus.PENDING,
        note="Order placed.",
        actor=user,
    )

    # The cart has become the order; clearing it prevents a double purchase on
    # a refresh or a double-clicked button.
    CartItem.objects.filter(cart=cart).delete()
    return order


@transaction.atomic
def restore_stock(item, *, note="Stock returned to inventory."):
    """Puts a cancelled or refunded line back on the shelf, exactly once."""
    if item.stock_released:
        return False

    if item.product_id:
        product = Product.all_objects.select_for_update().get(pk=item.product_id)
        product.stock += item.quantity
        product.save(update_fields=["stock", "updated_at"])

    if item.variant_id:
        variant = ProductVariant.objects.select_for_update().get(pk=item.variant_id)
        variant.stock += item.quantity
        variant.save(update_fields=["stock"])

    item.stock_released = True
    item.save(update_fields=["stock_released", "updated_at"])
    OrderEvent.objects.create(
        order_id=item.order_id, item=item, status=item.status, note=note
    )
    return True


@transaction.atomic
def transition_item(item, new_status, *, actor=None, note="", tracking_number=None):
    """Moves one line forward, validating the transition and releasing stock."""
    if not item.can_transition_to(new_status):
        raise ValidationError(
            {
                "status": (
                    f"Cannot go from '{item.get_status_display()}' to "
                    f"'{dict(OrderStatus.choices)[new_status]}'."
                )
            }
        )

    item.status = new_status
    fields = ["status", "updated_at"]
    if tracking_number is not None:
        item.tracking_number = tracking_number
        fields.append("tracking_number")
    item.save(update_fields=fields)

    OrderEvent.objects.create(
        order_id=item.order_id,
        item=item,
        status=new_status,
        note=note,
        actor=actor,
    )

    if new_status in STOCK_RELEASING:
        restore_stock(item)

    item.order.sync_status_from_items()
    return item


@transaction.atomic
def cancel_order(order, *, actor=None, reason=""):
    """Customer-initiated cancellation of every line that hasn't shipped."""
    if not order.can_customer_cancel:
        raise ValidationError(
            {"detail": "This order has already been packed and can no longer be cancelled."}
        )

    cancelled = 0
    for item in order.items.select_for_update():
        if item.status in STOCK_RELEASING:
            continue
        item.status = OrderStatus.CANCELLED
        item.save(update_fields=["status", "updated_at"])
        restore_stock(item, note="Cancelled by customer.")
        cancelled += 1

    order.cancel_reason = reason
    order.status = OrderStatus.CANCELLED
    order.save(update_fields=["status", "cancel_reason", "updated_at"])
    OrderEvent.objects.create(
        order=order,
        status=OrderStatus.CANCELLED,
        note=reason or "Cancelled by customer.",
        actor=actor,
    )
    return cancelled
