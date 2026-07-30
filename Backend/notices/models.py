"""Admin -> seller notices.

One direction only: the admin announces, sellers read. There is no reply model
because a reply channel is a conversation, and a conversation belongs in a
messaging feature with threading and unread state on both sides. Bolting a
`body` field onto a recipient row would be the beginning of a bad version of
that.

Two tables rather than one:

- ``AdminNotice`` is the message, written once.
- ``NoticeRecipient`` is one row per seller who received it, carrying that
  seller's ``read_at``.

The alternative — a single table with an ``audience="all"`` flag resolved at read
time — cannot store per-seller read state, and would retroactively deliver old
notices to sellers who registered afterwards. Materialising recipient rows costs
one bulk insert and makes "unread count" a plain indexed query.
"""

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel, UUIDModel


class AdminNotice(UUIDModel, TimeStampedModel):
    class Audience(models.TextChoices):
        ALL = "all", "All sellers"
        SELECTED = "selected", "Selected sellers"

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_notices",
    )
    subject = models.CharField(max_length=160)
    body = models.TextField()
    # Kept so the admin list can say "All sellers" instead of listing 40 names.
    # It is a record of intent, not the delivery mechanism — recipients are
    # always materialised rows.
    audience = models.CharField(
        max_length=10, choices=Audience.choices, default=Audience.SELECTED
    )

    class Meta:
        db_table = "notices_admin_notice"
        ordering = ["-created_at"]

    def __str__(self):
        return self.subject


class NoticeRecipient(UUIDModel):
    notice = models.ForeignKey(
        AdminNotice, on_delete=models.CASCADE, related_name="recipients"
    )
    seller = models.ForeignKey(
        "accounts.SellerProfile", on_delete=models.CASCADE, related_name="notices"
    )
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notices_notice_recipient"
        ordering = ["-notice__created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["notice", "seller"], name="uniq_notice_recipient"
            )
        ]
        # Serves the seller's unread badge: filter(seller=…, read_at__isnull=True).
        indexes = [models.Index(fields=["seller", "read_at"])]

    def __str__(self):
        return f"{self.notice.subject} -> {self.seller.shop_name}"

    @property
    def is_read(self):
        return self.read_at is not None
