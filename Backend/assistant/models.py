"""Shopping-assistant conversations.

Sessions are keyed by a client-generated UUID rather than requiring a login, so
a browsing guest can use the assistant. When a signed-in user chats, the session
is additionally linked to them, which is what makes "continue where you left
off" possible across devices later.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimeStampedModel, UUIDModel


class ChatSession(UUIDModel, TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_sessions",
    )
    title = models.CharField(max_length=140, blank=True)
    message_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "assistant_chat_session"
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["user", "-updated_at"])]

    def __str__(self):
        return self.title or f"Session {str(self.id)[:8]}"


class ChatMessage(UUIDModel):
    class Role(models.TextChoices):
        USER = "user", _("Customer")
        ASSISTANT = "assistant", _("Assistant")

    session = models.ForeignKey(
        ChatSession, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    content = models.TextField()

    # Which catalogue items this reply was grounded in. Stored as IDs rather
    # than a M2M so a later product deletion can't rewrite chat history, and so
    # the ordering the model chose is preserved.
    product_ids = models.JSONField(default=list, blank=True)

    # Retrieval diagnostics — how many products were offered to the model and
    # what filters were parsed. Invaluable when a recommendation looks wrong.
    retrieval_meta = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "assistant_chat_message"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["session", "created_at"])]

    def __str__(self):
        return f"{self.role}: {self.content[:60]}"
