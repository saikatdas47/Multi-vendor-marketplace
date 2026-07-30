from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Avg, Count, F, Q
from django.utils.translation import gettext_lazy as _

from accounts.models import SellerProfile
from core.models import BaseModel, TimeStampedModel


def with_product_counts(queryset):
    """Annotate `product_count`: buyable products in a category *and* its children.

    A function over a queryset rather than a manager method, because
    `SoftDeleteManager` hard-codes the queryset class it returns — layering a
    custom queryset on top of it would silently not apply.

    Two places need this and they had drifted: the list view annotated it, the
    tree serializer did not, so children came back with the key missing (a
    read-only DRF field with no attribute raises SkipField — omitted, not an
    error) and the Categories page rendered a blank count.

    What it must agree with:

    1. `ProductFilter.filter_category`, which includes descendants. Every product
       is filed under a leaf, so counting only direct products reported 0 for
       every root while the link showed a full grid of results.
    2. The soft-delete rule. Aggregating across a reverse relation bypasses
       Product's default manager, so deleted rows are counted unless excluded.

    Assumes the two-level tree the app has (root → child). A third level would
    need a recursive CTE; `CategoryDepthTests` fails if one is introduced.
    """

    def buyable(prefix):
        return Q(
            **{
                f"{prefix}__status": Product.Status.PUBLISHED,
                f"{prefix}__deleted_at__isnull": True,
            }
        )

    return queryset.annotate(
        # distinct=True on both: two multi-valued joins in one query otherwise
        # multiply each other's rows.
        own_count=Count("products", filter=buyable("products"), distinct=True),
        child_count=Count(
            "children__products", filter=buyable("children__products"), distinct=True
        ),
    ).annotate(product_count=F("own_count") + F("child_count"))


class Category(BaseModel):
    """Self-referencing tree so categories can nest arbitrarily deep."""

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="categories/", null=True, blank=True)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "products_category"
        verbose_name_plural = "categories"
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["parent", "name"], name="uniq_category_name_per_parent"
            )
        ]

    def __str__(self):
        return self.full_path

    @property
    def full_path(self):
        parts, node = [self.name], self.parent
        while node is not None:
            parts.append(node.name)
            node = node.parent
        return " > ".join(reversed(parts))

    def descendant_ids(self):
        """All category ids in this subtree, including self."""
        ids, frontier = [self.id], [self.id]
        while frontier:
            frontier = list(
                Category.objects.filter(parent_id__in=frontier).values_list("id", flat=True)
            )
            ids.extend(frontier)
        return ids


class ProductQuerySet(models.QuerySet):
    def published(self):
        return self.filter(status=Product.Status.PUBLISHED, deleted_at__isnull=True)

    def in_stock(self):
        return self.filter(stock__gt=0)

    def with_ratings(self):
        return self.annotate(
            avg_rating=Avg("reviews__rating"), review_count=Count("reviews", distinct=True)
        )


class ProductManager(models.Manager.from_queryset(ProductQuerySet)):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class Product(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        PUBLISHED = "published", _("Published")
        ARCHIVED = "archived", _("Archived")

    seller = models.ForeignKey(
        SellerProfile, on_delete=models.CASCADE, related_name="products"
    )
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="products"
    )
    name = models.CharField(max_length=200, db_index=True)
    slug = models.SlugField(max_length=230, unique=True)
    sku = models.CharField(max_length=64, unique=True)
    short_description = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)

    price = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    compare_at_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Original price, shown struck through.",
    )
    cost_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    stock = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    weight_grams = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    is_featured = models.BooleanField(default=False)
    view_count = models.PositiveIntegerField(default=0)

    objects = ProductManager()
    all_objects = models.Manager()

    class Meta:
        db_table = "products_product"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["seller", "status"]),
            models.Index(fields=["category", "status"]),
            models.Index(fields=["price"]),
        ]

    def __str__(self):
        return self.name

    @property
    def is_low_stock(self):
        return 0 < self.stock <= self.low_stock_threshold

    @property
    def is_out_of_stock(self):
        return self.stock == 0

    @property
    def discount_percent(self):
        if self.compare_at_price and self.compare_at_price > self.price:
            return round((1 - self.price / self.compare_at_price) * 100)
        return 0

    @property
    def primary_image(self):
        return self.images.filter(is_primary=True).first() or self.images.first()


class ProductImage(TimeStampedModel):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="images"
    )
    image = models.ImageField(upload_to="products/%Y/%m/")
    alt_text = models.CharField(max_length=150, blank=True)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "products_product_image"
        ordering = ["-is_primary", "sort_order", "created_at"]

    def __str__(self):
        return f"Image<{self.product.name}>"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_primary:
            ProductImage.objects.filter(product=self.product).exclude(pk=self.pk).update(
                is_primary=False
            )


class ProductVariant(TimeStampedModel):
    """e.g. Size: L / Colour: Black - carries its own SKU, price delta and stock."""

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variants"
    )
    name = models.CharField(max_length=100, help_text="e.g. Size")
    value = models.CharField(max_length=100, help_text="e.g. Large")
    sku = models.CharField(max_length=64, unique=True)
    price_delta = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    stock = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "products_product_variant"
        ordering = ["name", "value"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "name", "value"], name="uniq_variant_per_product"
            )
        ]

    def __str__(self):
        return f"{self.product.name} - {self.name}: {self.value}"

    @property
    def final_price(self):
        return self.product.price + self.price_delta


class Review(TimeStampedModel):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="reviews"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    title = models.CharField(max_length=150, blank=True)
    comment = models.TextField(blank=True)
    is_verified_purchase = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=True)
    helpful_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "products_review"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "user"], name="uniq_review_per_user_product"
            )
        ]
        indexes = [models.Index(fields=["product", "-created_at"])]

    def __str__(self):
        return f"{self.rating}* {self.product.name} by {self.user.email}"
