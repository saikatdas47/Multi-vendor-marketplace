"""Two-way admin <-> seller messaging.

This is what the one-way notice cannot do. A notice is a broadcast with a read
receipt; this is a conversation, so the seller can answer.

One thread per shop, not per topic. The platform is a single counterparty from
the seller's side, so a shop's whole relationship with the admin is one
transcript — which is also why `seller` is a OneToOneField and starting a thread
is a `get_or_create`.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel, UUIDModel


class Conversation(UUIDModel, TimeStampedModel):
    seller = models.OneToOneField(
        "accounts.SellerProfile", on_delete=models.CASCADE, related_name="conversation"
    )

    # Denormalised so the admin inbox — "threads by recency, with an unread
    # badge" — is one indexed read instead of a subquery per row.
    last_message_at = models.DateTimeField(default=timezone.now, db_index=True)
    admin_unread = models.PositiveIntegerField(default=0)
    seller_unread = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "messaging_conversation"
        ordering = ["-last_message_at"]
        indexes = [models.Index(fields=["-last_message_at"])]

    def __str__(self):
        return f"Conversation with {self.seller.shop_name}"


class Message(UUIDModel):
    class Side(models.TextChoices):
        ADMIN = "admin", "Platform"
        SELLER = "seller", "Seller"

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_messages",
    )
    # Which side sent it, stored independently of `sender`.
    #
    # `sender` is SET_NULL so deleting a staff account does not delete the
    # transcript — but that would leave a message with no way to tell who said
    # it, and a thread where every orphaned line renders as the seller's is
    # worse than useless. The side is a fact about the message, not about the
    # user row, so it belongs here.
    side = models.CharField(max_length=8, choices=Side.choices)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "messaging_message"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]

    def __str__(self):
        return f"{self.side}: {self.body[:40]}"
