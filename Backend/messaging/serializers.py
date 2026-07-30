from rest_framework import serializers

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_email = serializers.EmailField(source="sender.email", read_only=True, default=None)
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "side", "is_admin", "body", "sender_email", "created_at"]
        read_only_fields = fields

    def get_is_admin(self, obj):
        # Derived from `side`, never from `sender`: the sender may have been
        # deleted, and the side is what decides which end of the bubble it goes.
        return obj.side == Message.Side.ADMIN


class ThreadSerializer(serializers.ModelSerializer):
    """Full transcript. Used by both sides; `unread` is resolved per audience."""

    messages = MessageSerializer(many=True, read_only=True)
    shop_name = serializers.CharField(source="seller.shop_name", read_only=True)
    shop_slug = serializers.SlugField(source="seller.slug", read_only=True)
    seller_id = serializers.IntegerField(source="seller.id", read_only=True)
    seller_email = serializers.EmailField(source="seller.user.email", read_only=True)

    class Meta:
        model = Conversation
        fields = [
            "id", "seller_id", "shop_name", "shop_slug", "seller_email",
            "last_message_at", "admin_unread", "seller_unread", "messages",
        ]
        read_only_fields = fields


class ThreadListSerializer(serializers.ModelSerializer):
    """Inbox row: no transcript, plus a preview of the latest line."""

    shop_name = serializers.CharField(source="seller.shop_name", read_only=True)
    seller_id = serializers.IntegerField(source="seller.id", read_only=True)
    seller_email = serializers.EmailField(source="seller.user.email", read_only=True)
    shop_status = serializers.CharField(source="seller.status", read_only=True)
    preview = serializers.SerializerMethodField()
    message_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Conversation
        fields = [
            "id", "seller_id", "shop_name", "seller_email", "shop_status",
            "last_message_at", "admin_unread", "seller_unread", "preview",
            "message_count",
        ]
        read_only_fields = fields

    def get_preview(self, obj):
        # `latest_message` is attached by the view via Prefetch, so this does not
        # fire a query per row.
        latest = getattr(obj, "latest_message", None)
        if latest:
            return {"side": latest[0].side, "body": latest[0].body[:120]}
        return None


class PostMessageSerializer(serializers.Serializer):
    body = serializers.CharField()

    def validate_body(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Write something first.")
        if len(cleaned) > 5000:
            raise serializers.ValidationError("Keep it under 5000 characters.")
        return cleaned
