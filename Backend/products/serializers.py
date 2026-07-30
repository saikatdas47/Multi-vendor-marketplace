from django.db.models import Avg
from django.utils.text import slugify
from rest_framework import serializers

from .models import (
    Category,
    Product,
    ProductImage,
    ProductVariant,
    Review,
    with_product_counts,
)


def unique_slug(model, value, fallback="item"):
    """Slugify and de-duplicate, checking soft-deleted rows too."""
    manager = getattr(model, "all_objects", model.objects)
    base = slugify(value) or fallback
    slug, i = base, 1
    while manager.filter(slug=slug).exists():
        slug = f"{base}-{i}"
        i += 1
    return slug


class CategorySerializer(serializers.ModelSerializer):
    full_path = serializers.CharField(read_only=True)
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = [
            "id", "name", "slug", "description", "image", "parent",
            "is_active", "sort_order", "full_path", "product_count",
        ]
        read_only_fields = ["id", "slug"]

    def create(self, validated_data):
        validated_data["slug"] = unique_slug(Category, validated_data["name"], "category")
        return super().create(validated_data)


class CategoryTreeSerializer(CategorySerializer):
    children = serializers.SerializerMethodField()

    class Meta(CategorySerializer.Meta):
        fields = CategorySerializer.Meta.fields + ["children"]

    def get_children(self, obj):
        # Annotated, not a bare related manager. Without this the children have
        # no `product_count` attribute, DRF quietly drops the key (a read-only
        # field with no attribute raises SkipField), and the Categories page
        # renders a blank count next to every subcategory.
        kids = with_product_counts(obj.children.filter(is_active=True)).order_by(
            "sort_order", "name"
        )
        return CategoryTreeSerializer(kids, many=True, context=self.context).data


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt_text", "is_primary", "sort_order"]


class ProductVariantSerializer(serializers.ModelSerializer):
    final_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = ProductVariant
        fields = [
            "id", "name", "value", "sku", "price_delta",
            "final_price", "stock", "is_active",
        ]


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id", "product", "user", "user_name", "rating", "title", "comment",
            "is_verified_purchase", "helpful_count", "created_at",
        ]
        read_only_fields = [
            "id", "user", "user_name", "is_verified_purchase",
            "helpful_count", "created_at",
        ]

    def validate(self, attrs):
        request = self.context["request"]
        product = attrs.get("product") or getattr(self.instance, "product", None)
        if self.instance is None and Review.objects.filter(
            product=product, user=request.user
        ).exists():
            raise serializers.ValidationError("You have already reviewed this product.")
        return attrs


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight payload for grids and search results."""

    seller_name = serializers.CharField(source="seller.shop_name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    primary_image = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    discount_percent = serializers.IntegerField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "price", "compare_at_price", "discount_percent",
            "stock", "status", "is_featured", "seller_name", "category_name",
            "primary_image", "avg_rating", "review_count", "created_at",
        ]

    def get_primary_image(self, obj):
        image = obj.primary_image
        if not image:
            return None
        request = self.context.get("request")
        url = image.image.url
        return request.build_absolute_uri(url) if request else url

    def get_avg_rating(self, obj):
        """Uses the annotation when present, falls back to a query."""
        value = getattr(obj, "avg_rating", None)
        if value is None:
            value = obj.reviews.aggregate(a=Avg("rating"))["a"]
        return round(value, 2) if value else None

    def get_review_count(self, obj):
        count = getattr(obj, "review_count", None)
        return obj.reviews.count() if count is None else count


class ProductDetailSerializer(serializers.ModelSerializer):
    seller = serializers.SerializerMethodField()
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.filter(is_active=True),
        source="category",
        write_only=True,
    )
    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    discount_percent = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "sku", "short_description", "description",
            "price", "compare_at_price", "cost_price", "stock",
            "low_stock_threshold", "weight_grams", "status", "is_featured",
            "view_count", "seller", "category", "category_id", "images",
            "variants", "avg_rating", "review_count", "discount_percent",
            "is_low_stock", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "view_count", "created_at", "updated_at"]
        extra_kwargs = {"cost_price": {"write_only": True}}

    def get_seller(self, obj):
        return {
            "id": obj.seller.id,
            "shop_name": obj.seller.shop_name,
            "slug": obj.seller.slug,
        }

    def get_avg_rating(self, obj):
        value = getattr(obj, "avg_rating", None)
        if value is None:
            value = obj.reviews.aggregate(a=Avg("rating"))["a"]
        return round(value, 2) if value else None

    def get_review_count(self, obj):
        count = getattr(obj, "review_count", None)
        if count is None:
            count = obj.reviews.count()
        return count

    def validate(self, attrs):
        price = attrs.get("price", getattr(self.instance, "price", None))
        compare = attrs.get(
            "compare_at_price", getattr(self.instance, "compare_at_price", None)
        )
        if price and compare and compare <= price:
            raise serializers.ValidationError(
                {"compare_at_price": "Compare-at price must be higher than the price."}
            )
        return attrs

    def create(self, validated_data):
        validated_data["slug"] = unique_slug(Product, validated_data["name"], "product")
        return super().create(validated_data)


class StockAdjustSerializer(serializers.Serializer):
    delta = serializers.IntegerField(
        help_text="Positive to restock, negative to deduct."
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_delta(self, value):
        if value == 0:
            raise serializers.ValidationError("Delta cannot be zero.")
        return value
