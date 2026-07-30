from rest_framework import serializers

from accounts.models import SellerProfile

from .models import AdminNotice, NoticeRecipient


class NoticeSendSerializer(serializers.Serializer):
    """Admin composing a notice.

    ``seller_ids`` empty or absent means "all sellers"; the flag is explicit so a
    UI bug that drops the array can't silently broadcast. Sending to everyone has
    to be asked for.
    """

    subject = serializers.CharField(max_length=160)
    body = serializers.CharField()
    send_to_all = serializers.BooleanField(default=False)
    seller_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )

    def validate(self, attrs):
        if not attrs.get("send_to_all") and not attrs.get("seller_ids"):
            raise serializers.ValidationError(
                {"seller_ids": "Pick at least one seller, or set send_to_all."}
            )
        if attrs.get("send_to_all") and attrs.get("seller_ids"):
            raise serializers.ValidationError(
                {"send_to_all": "Choose either specific sellers or all sellers."}
            )
        if attrs.get("seller_ids"):
            found = set(
                SellerProfile.objects.filter(id__in=attrs["seller_ids"]).values_list(
                    "id", flat=True
                )
            )
            missing = set(attrs["seller_ids"]) - found
            if missing:
                raise serializers.ValidationError(
                    {"seller_ids": f"Unknown seller ids: {sorted(missing)}"}
                )
        return attrs


class AdminNoticeSerializer(serializers.ModelSerializer):
    """Admin's view of a sent notice, with delivery and read stats."""

    author_email = serializers.EmailField(source="author.email", read_only=True)
    recipient_count = serializers.IntegerField(read_only=True)
    read_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = AdminNotice
        fields = [
            "id", "subject", "body", "audience", "author_email",
            "recipient_count", "read_count", "created_at",
        ]


class SellerNoticeSerializer(serializers.ModelSerializer):
    """Seller's view. Flattened, because a seller does not care that delivery is
    modelled as a join table."""

    id = serializers.UUIDField(read_only=True)
    subject = serializers.CharField(source="notice.subject", read_only=True)
    body = serializers.CharField(source="notice.body", read_only=True)
    sent_at = serializers.DateTimeField(source="notice.created_at", read_only=True)
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = NoticeRecipient
        fields = ["id", "subject", "body", "sent_at", "read_at", "is_read"]
