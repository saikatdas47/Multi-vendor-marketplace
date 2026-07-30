from rest_framework import serializers

from accounts.models import Address

from .models import (
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    PaymentMethod,
)


class OrderEventSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = OrderEvent
        fields = ["id", "status", "status_display", "note", "created_at"]


class OrderItemSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            "id", "product", "product_name", "product_sku", "product_slug",
            "variant_label", "seller", "seller_name", "unit_price", "quantity",
            "line_total", "image_url", "status", "status_display",
            "tracking_number",
        ]
        read_only_fields = fields


class OrderListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_display = serializers.CharField(
        source="get_payment_status_display", read_only=True
    )
    item_count = serializers.IntegerField(read_only=True)
    seller_names = serializers.ListField(child=serializers.CharField(), read_only=True)
    first_image = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "number", "status", "status_display", "payment_status",
            "payment_status_display", "total", "item_count", "seller_names",
            "first_image", "placed_at",
        ]

    def get_first_image(self, obj):
        item = obj.items.first()
        return item.image_url if item else ""


class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    events = OrderEventSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_display = serializers.CharField(
        source="get_payment_status_display", read_only=True
    )
    payment_method_display = serializers.CharField(
        source="get_payment_method_display", read_only=True
    )
    can_customer_cancel = serializers.BooleanField(read_only=True)
    shipping_address = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "number", "status", "status_display", "payment_status",
            "payment_status_display", "payment_method", "payment_method_display",
            "payment_reference", "shipping_address", "subtotal", "shipping_fee",
            "discount", "tax", "total", "customer_note", "cancel_reason",
            "can_customer_cancel", "items", "events", "placed_at",
            "delivered_at", "created_at",
        ]

    def get_shipping_address(self, obj):
        return {
            "full_name": obj.ship_to_name,
            "phone": obj.ship_to_phone,
            "line1": obj.ship_to_line1,
            "line2": obj.ship_to_line2,
            "city": obj.ship_to_city,
            "state": obj.ship_to_state,
            "postal_code": obj.ship_to_postal_code,
            "country": obj.ship_to_country,
        }


class CheckoutSerializer(serializers.Serializer):
    address = serializers.UUIDField(help_text="ID of one of your saved addresses.")
    payment_method = serializers.ChoiceField(
        choices=PaymentMethod.choices, default=PaymentMethod.CASH_ON_DELIVERY
    )
    customer_note = serializers.CharField(
        required=False, allow_blank=True, max_length=1000
    )

    def validate_address(self, value):
        user = self.context["request"].user
        address = Address.objects.filter(pk=value, user=user).first()
        if not address:
            raise serializers.ValidationError(
                "Address not found. Add a delivery address first."
            )
        return address


class CancelOrderSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


class ItemStatusSerializer(serializers.Serializer):
    """Sellers advance their own lines; the choices exclude customer-only moves."""

    status = serializers.ChoiceField(
        choices=[
            OrderStatus.CONFIRMED,
            OrderStatus.PACKED,
            OrderStatus.SHIPPED,
            OrderStatus.OUT_FOR_DELIVERY,
            OrderStatus.DELIVERED,
            OrderStatus.CANCELLED,
        ]
    )
    tracking_number = serializers.CharField(
        required=False, allow_blank=True, max_length=120
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class SellerOrderItemSerializer(OrderItemSerializer):
    """What a seller sees: their line plus the shipping details they need."""

    order_number = serializers.CharField(source="order.number", read_only=True)
    order_id = serializers.UUIDField(source="order.id", read_only=True)
    placed_at = serializers.DateTimeField(source="order.placed_at", read_only=True)
    customer_name = serializers.CharField(source="order.ship_to_name", read_only=True)
    ship_to_city = serializers.CharField(source="order.ship_to_city", read_only=True)
    payment_status = serializers.CharField(
        source="order.payment_status", read_only=True
    )

    class Meta(OrderItemSerializer.Meta):
        fields = OrderItemSerializer.Meta.fields + [
            "order_number", "order_id", "placed_at", "customer_name",
            "ship_to_city", "payment_status",
        ]
        read_only_fields = fields
