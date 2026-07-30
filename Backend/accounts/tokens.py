"""Single-use, expiring tokens for email verification and password reset.

Only a SHA-256 hash of each token is stored, so a database leak cannot be
replayed against the reset endpoint - the same reason passwords are hashed.
"""

import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone


def generate_token():
    """Returns (plaintext, sha256 hash). Only the plaintext is emailed."""
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def hash_token(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


class EmailToken(models.Model):
    class Purpose(models.TextChoices):
        VERIFY_EMAIL = "verify_email", "Verify email"
        RESET_PASSWORD = "reset_password", "Reset password"

    @classmethod
    def ttl_hours(cls, purpose):
        """Lifetimes are configured in .env, not baked into the model."""
        return {
            cls.Purpose.VERIFY_EMAIL: settings.VERIFY_TOKEN_TTL_HOURS,
            cls.Purpose.RESET_PASSWORD: settings.RESET_TOKEN_TTL_HOURS,
        }[purpose]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="email_tokens"
    )
    purpose = models.CharField(max_length=32, choices=Purpose.choices, db_index=True)
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "accounts_email_token"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "purpose", "used_at"])]

    def __str__(self):
        return f"{self.purpose} for {self.user.email}"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    @property
    def is_valid(self):
        return self.used_at is None and not self.is_expired

    def consume(self):
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])

    @classmethod
    def issue(cls, user, purpose):
        """Invalidates any outstanding tokens of this purpose, then issues one."""
        cls.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(
            used_at=timezone.now()
        )
        raw, digest = generate_token()
        token = cls.objects.create(
            user=user,
            purpose=purpose,
            token_hash=digest,
            expires_at=timezone.now()
            + timezone.timedelta(hours=cls.ttl_hours(purpose)),
        )
        return raw, token

    @classmethod
    def resolve(cls, raw, purpose):
        """Returns a usable token, or None. Never reveals why it failed."""
        token = cls.objects.filter(
            token_hash=hash_token(raw), purpose=purpose
        ).select_related("user").first()
        return token if token and token.is_valid else None
