from rest_framework import serializers

from products.models import Product, ProductVariant
from products.serializers import ProductListSerializer

from .models import Cart, CartItem, WishlistItem


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    variant_label = serializers.SerializerMethodField()
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    current_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    available_stock = serializers.IntegerField(read_only=True)
    price_changed = serializers.BooleanField(read_only=True)

    class Meta:
        model = CartItem
        fields = [
            "id", "product", "variant", "variant_label", "quantity",
            "unit_price", "current_price", "line_total", "available_stock",
            "price_changed", "created_at",
        ]
        read_only_fields = ["id", "unit_price", "created_at"]

    def get_variant_label(self, obj):
        return f"{obj.variant.name}: {obj.variant.value}" if obj.variant else None


class CartSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_quantity = serializers.IntegerField(read_only=True)
    distinct_items = serializers.IntegerField(read_only=True)
    issues = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = [
            "id", "items", "subtotal", "total_quantity",
            "distinct_items", "issues", "updated_at",
        ]

    def get_items(self, obj):
        return CartItemSerializer(obj.items_qs, many=True, context=self.context).data

    def get_issues(self, obj):
        return obj.issues()


class AddToCartSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    variant = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1, max_value=999, default=1)

    def validate(self, attrs):
        product = Product.objects.filter(
            pk=attrs["product"], status=Product.Status.PUBLISHED
        ).first()
        if not product:
            raise serializers.ValidationError(
                {"product": "Product not found or not available."}
            )

        variant = None
        if attrs.get("variant"):
            variant = ProductVariant.objects.filter(
                pk=attrs["variant"], product=product, is_active=True
            ).first()
            if not variant:
                raise serializers.ValidationError(
                    {"variant": "That option is not available for this product."}
                )

        request = self.context["request"]
        if product.seller.user_id == request.user.id:
            raise serializers.ValidationError(
                {"product": "You cannot buy your own product."}
            )

        attrs["product_obj"] = product
        attrs["variant_obj"] = variant
        return attrs


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=999)


class WishlistItemSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    product_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = WishlistItem
        fields = ["id", "product", "product_id", "note", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_product_id(self, value):
        if not Product.objects.filter(pk=value, status=Product.Status.PUBLISHED).exists():
            raise serializers.ValidationError("Product not found or not available.")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        product_id = validated_data.pop("product_id")
        item, _created = WishlistItem.objects.get_or_create(
            user=user, product_id=product_id, defaults=validated_data
        )
        return item
