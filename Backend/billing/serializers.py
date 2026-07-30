from rest_framework import serializers

from .models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    """Seller's view of their own invoice."""

    period_label = serializers.CharField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    is_settled = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "period", "period_label", "amount", "status", "due_date",
            "is_overdue", "is_settled", "payment_reference", "submitted_at",
            "paid_at", "note", "created_at",
        ]
        read_only_fields = fields


class AdminInvoiceSerializer(InvoiceSerializer):
    """Adds the shop, since the admin list spans every seller."""

    shop_name = serializers.CharField(source="seller.shop_name", read_only=True)
    shop_slug = serializers.SlugField(source="seller.slug", read_only=True)
    seller_email = serializers.EmailField(source="seller.user.email", read_only=True)
    seller_id = serializers.IntegerField(source="seller.id", read_only=True)

    class Meta(InvoiceSerializer.Meta):
        fields = InvoiceSerializer.Meta.fields + [
            "shop_name", "shop_slug", "seller_email", "seller_id",
        ]
        read_only_fields = fields


class SubmitPaymentSerializer(serializers.Serializer):
    payment_reference = serializers.CharField(max_length=120)

    def validate_payment_reference(self, value):
        cleaned = value.strip()
        if len(cleaned) < 4:
            raise serializers.ValidationError(
                "Enter the transaction reference from your transfer."
            )
        return cleaned


class ConfirmPaymentSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)


class GenerateInvoicesSerializer(serializers.Serializer):
    """Optional explicit period; defaults to last month."""

    year = serializers.IntegerField(min_value=2020, max_value=2100, required=False)
    month = serializers.IntegerField(min_value=1, max_value=12, required=False)

    def validate(self, attrs):
        if ("year" in attrs) != ("month" in attrs):
            raise serializers.ValidationError(
                "Give both year and month, or neither to bill last month."
            )
        return attrs
