from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .tokens import EmailToken, hash_token

User = get_user_model()

# Throttles use the cache; give each test class its own so counts don't leak.
NO_THROTTLE = {
    "DEFAULT_THROTTLE_RATES": {
        "anon": None,
        "user": None,
        "email": None,
        "ai": None,
    }
}


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class TokenModelTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="u@example.com", password="Str0ngPass!23"
        )

    def test_only_hash_is_stored(self):
        raw, token = EmailToken.issue(self.user, EmailToken.Purpose.VERIFY_EMAIL)
        self.assertNotEqual(raw, token.token_hash)
        self.assertEqual(token.token_hash, hash_token(raw))

    def test_issuing_invalidates_previous_token(self):
        first_raw, first = EmailToken.issue(self.user, EmailToken.Purpose.VERIFY_EMAIL)
        EmailToken.issue(self.user, EmailToken.Purpose.VERIFY_EMAIL)

        first.refresh_from_db()
        self.assertIsNotNone(first.used_at)
        self.assertIsNone(
            EmailToken.resolve(first_raw, EmailToken.Purpose.VERIFY_EMAIL)
        )

    def test_expired_token_does_not_resolve(self):
        raw, token = EmailToken.issue(self.user, EmailToken.Purpose.RESET_PASSWORD)
        token.expires_at = timezone.now() - timezone.timedelta(minutes=1)
        token.save(update_fields=["expires_at"])
        self.assertIsNone(
            EmailToken.resolve(raw, EmailToken.Purpose.RESET_PASSWORD)
        )

    def test_token_is_purpose_scoped(self):
        """A verification token must not work as a password reset token."""
        raw, _ = EmailToken.issue(self.user, EmailToken.Purpose.VERIFY_EMAIL)
        self.assertIsNone(
            EmailToken.resolve(raw, EmailToken.Purpose.RESET_PASSWORD)
        )


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class VerifyEmailTests(APITestCase):
    def test_registration_sends_verification_email(self):
        mail.outbox = []
        response = self.client.post(
            reverse("accounts:register"),
            {
                "email": "new@example.com",
                "password": "Str0ngPass!23",
                "password_confirm": "Str0ngPass!23",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify", mail.outbox[0].subject.lower())
        self.assertFalse(User.objects.get(email="new@example.com").email_verified)

    def test_valid_token_verifies_account(self):
        user = User.objects.create_user(
            email="v@example.com", password="Str0ngPass!23"
        )
        raw, _ = EmailToken.issue(user, EmailToken.Purpose.VERIFY_EMAIL)

        response = self.client.post(
            reverse("accounts:verify-email"), {"token": raw}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.email_verified)

    def test_token_cannot_be_reused(self):
        user = User.objects.create_user(
            email="v2@example.com", password="Str0ngPass!23"
        )
        raw, _ = EmailToken.issue(user, EmailToken.Purpose.VERIFY_EMAIL)

        self.client.post(reverse("accounts:verify-email"), {"token": raw}, format="json")
        second = self.client.post(
            reverse("accounts:verify-email"), {"token": raw}, format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_garbage_token_rejected(self):
        response = self.client.post(
            reverse("accounts:verify-email"), {"token": "nonsense"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class PasswordResetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="reset@example.com", password="OldPass!2345"
        )

    def test_unknown_email_looks_identical_to_known(self):
        """Forgot-password must not reveal whether an account exists."""
        known = self.client.post(
            reverse("accounts:forgot-password"),
            {"email": "reset@example.com"},
            format="json",
        )
        unknown = self.client.post(
            reverse("accounts:forgot-password"),
            {"email": "nobody@example.com"},
            format="json",
        )
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.data, unknown.data)

    def test_reset_changes_password(self):
        raw, _ = EmailToken.issue(self.user, EmailToken.Purpose.RESET_PASSWORD)
        response = self.client.post(
            reverse("accounts:reset-password"),
            {
                "token": raw,
                "new_password": "BrandNew!2345",
                "new_password_confirm": "BrandNew!2345",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNew!2345"))
        self.assertFalse(self.user.check_password("OldPass!2345"))

    def test_mismatched_confirmation_rejected(self):
        raw, _ = EmailToken.issue(self.user, EmailToken.Purpose.RESET_PASSWORD)
        response = self.client.post(
            reverse("accounts:reset-password"),
            {
                "token": raw,
                "new_password": "BrandNew!2345",
                "new_password_confirm": "Different!2345",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass!2345"))

    def test_weak_password_rejected(self):
        raw, _ = EmailToken.issue(self.user, EmailToken.Purpose.RESET_PASSWORD)
        response = self.client.post(
            reverse("accounts:reset-password"),
            {"token": raw, "new_password": "123", "new_password_confirm": "123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_token_is_single_use(self):
        raw, _ = EmailToken.issue(self.user, EmailToken.Purpose.RESET_PASSWORD)
        payload = {
            "token": raw,
            "new_password": "BrandNew!2345",
            "new_password_confirm": "BrandNew!2345",
        }
        self.client.post(reverse("accounts:reset-password"), payload, format="json")
        again = self.client.post(
            reverse("accounts:reset-password"), payload, format="json"
        )
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)


class EmailThrottleTests(APITestCase):
    def test_forgot_password_is_throttled(self):
        """Without a cap, this endpoint is a free email cannon."""
        from django.core.cache import cache

        cache.clear()
        statuses = [
            self.client.post(
                reverse("accounts:forgot-password"),
                {"email": "someone@example.com"},
                format="json",
            ).status_code
            for _ in range(7)
        ]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, statuses)
        cache.clear()
