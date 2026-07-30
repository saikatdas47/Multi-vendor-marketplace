from rest_framework import serializers

from accounts.models import SellerProfile


class ShopListSerializer(serializers.ModelSerializer):
    """Storefront card. Deliberately narrower than ``SellerProfileSerializer``,
    which carries commission_rate, tax_id and business contact details — none of
    which belong in a public response."""

    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = SellerProfile
        fields = ["id", "shop_name", "slug", "description", "logo", "product_count",
                  "created_at"]


class ShopDetailSerializer(ShopListSerializer):
    class Meta(ShopListSerializer.Meta):
        fields = ShopListSerializer.Meta.fields
