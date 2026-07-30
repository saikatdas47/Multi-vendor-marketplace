from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimeStampedModel, UUIDModel
from products.models import Product, ProductVariant


class Cart(UUIDModel, TimeStampedModel):
    """One active cart per user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart"
    )

    class Meta:
        db_table = "cart_cart"

    def __str__(self):
        return f"Cart<{self.user.email}>"

    @property
    def items_qs(self):
        return self.items.select_related("product", "product__seller", "variant")

    @property
    def subtotal(self):
        return sum((item.line_total for item in self.items_qs), Decimal("0.00"))

    @property
    def total_quantity(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def distinct_items(self):
        return self.items.count()

    def issues(self):
        """Problems that must be resolved before checkout."""
        problems = []
        for item in self.items_qs:
            if item.product.status != Product.Status.PUBLISHED:
                problems.append(
                    {"item": str(item.id), "detail": f"{item.product.name} is no longer available."}
                )
            elif item.available_stock == 0:
                problems.append(
                    {"item": str(item.id), "detail": f"{item.product.name} is out of stock."}
                )
            elif item.quantity > item.available_stock:
                problems.append(
                    {
                        "item": str(item.id),
                        "detail": (
                            f"Only {item.available_stock} left of {item.product.name}; "
                            f"you have {item.quantity} in your cart."
                        ),
                    }
                )
            elif item.unit_price != item.current_price:
                problems.append(
                    {
                        "item": str(item.id),
                        "detail": f"The price of {item.product.name} changed.",
                    }
                )
        return problems


class CartItem(UUIDModel, TimeStampedModel):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="cart_items"
    )
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="cart_items",
    )
    quantity = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1)]
    )
    # Snapshot taken when the item was added, so a mid-session price change is
    # visible to the customer instead of silently altering their total.
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "cart_cart_item"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["cart", "product", "variant"],
                name="uniq_cart_product_variant",
            )
        ]
        indexes = [models.Index(fields=["cart", "product"])]

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

    @property
    def current_price(self):
        """Live price, including any variant delta."""
        price = self.product.price
        if self.variant:
            price += self.variant.price_delta
        return price

    @property
    def available_stock(self):
        return self.variant.stock if self.variant else self.product.stock

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    @property
    def price_changed(self):
        return self.unit_price != self.current_price

    def resync_price(self):
        self.unit_price = self.current_price
        self.save(update_fields=["unit_price", "updated_at"])


class WishlistItem(UUIDModel, TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist"
    )
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="wishlisted_by"
    )
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "cart_wishlist_item"
        ordering = ["-created_at"]
        verbose_name = _("wishlist item")
        constraints = [
            models.UniqueConstraint(
                fields=["user", "product"], name="uniq_wishlist_user_product"
            )
        ]

    def __str__(self):
        return f"Wishlist<{self.user.email}: {self.product.name}>"
