from rest_framework import serializers

from products.serializers import ProductListSerializer

from .models import ChatMessage, ChatSession


class AskSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=500, trim_whitespace=True)
    session_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_message(self, value):
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Please ask a slightly longer question.")
        return value.strip()


class ChatMessageSerializer(serializers.ModelSerializer):
    products = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "products", "created_at"]

    def get_products(self, obj):
        # Rehydrated from the ids stored on the message, so history shows live
        # prices rather than whatever they were when the reply was written.
        products = self.context.get("product_map", {})
        return [
            ProductListSerializer(products[pid], context=self.context).data
            for pid in obj.product_ids
            if pid in products
        ]


class ChatSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatSession
        fields = ["id", "title", "message_count", "created_at", "updated_at"]
