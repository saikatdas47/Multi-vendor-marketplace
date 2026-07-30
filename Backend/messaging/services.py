"""Posting a message touches three things atomically: the message row, the
thread's recency, and the other side's unread counter."""

from django.db.models import F
from django.db import transaction
from django.utils import timezone

from .models import Conversation, Message


def get_thread(seller):
    """The shop's thread with the platform, created on first use."""
    conversation, _ = Conversation.objects.get_or_create(seller=seller)
    return conversation


@transaction.atomic
def post_message(*, seller, sender, side, body):
    conversation = get_thread(seller)
    message = Message.objects.create(
        conversation=conversation, sender=sender, side=side, body=body
    )

    # F() rather than read-modify-write: two admins replying at once would
    # otherwise each read the same count and one increment would vanish.
    unread_field = (
        "seller_unread" if side == Message.Side.ADMIN else "admin_unread"
    )
    Conversation.objects.filter(pk=conversation.pk).update(
        last_message_at=timezone.now(), **{unread_field: F(unread_field) + 1}
    )
    conversation.refresh_from_db()
    return conversation, message


@transaction.atomic
def mark_read(conversation, *, side):
    """Clear the reader's own counter. Reading does not touch the other side's."""
    field = "admin_unread" if side == Message.Side.ADMIN else "seller_unread"
    Conversation.objects.filter(pk=conversation.pk).update(**{field: 0})
    setattr(conversation, field, 0)
    return conversation
