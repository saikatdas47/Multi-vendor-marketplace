from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import SellerProfile

User = get_user_model()


class RegistrationTests(APITestCase):
    def test_customer_registration_returns_tokens(self):
        response = self.client.post(
            reverse("accounts:register"),
            {
                "email": "buyer@example.com",
                "password": "Str0ngPass!23",
                "password_confirm": "Str0ngPass!23",
                "first_name": "Bob",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["role"], "customer")

    def test_seller_registration_requires_shop_name(self):
        response = self.client.post(
            reverse("accounts:register"),
            {
                "email": "shop@example.com",
                "password": "Str0ngPass!23",
                "password_confirm": "Str0ngPass!23",
                "role": "seller",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("shop_name", response.data)

    def test_seller_starts_pending_approval(self):
        self.client.post(
            reverse("accounts:register"),
            {
                "email": "shop2@example.com",
                "password": "Str0ngPass!23",
                "password_confirm": "Str0ngPass!23",
                "role": "seller",
                "shop_name": "Gadget Hub",
            },
            format="json",
        )
        profile = SellerProfile.objects.get(shop_name="Gadget Hub")
        self.assertEqual(profile.status, SellerProfile.Status.PENDING)
        self.assertFalse(profile.is_approved)

    def test_mismatched_passwords_rejected(self):
        response = self.client.post(
            reverse("accounts:register"),
            {
                "email": "x@example.com",
                "password": "Str0ngPass!23",
                "password_confirm": "Different!23",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="user@example.com", password="Str0ngPass!23"
        )

    def test_login_embeds_role_claim(self):
        response = self.client.post(
            reverse("accounts:login"),
            {"email": "user@example.com", "password": "Str0ngPass!23"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["role"], "customer")

    def test_me_requires_authentication(self):
        self.assertEqual(
            self.client.get(reverse("accounts:me")).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_me_returns_profile_when_authenticated(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("accounts:me"))
        self.assertEqual(response.data["email"], "user@example.com")


class RBACTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email="c@example.com", password="Str0ngPass!23"
        )
        self.admin = User.objects.create_superuser(
            email="admin@example.com", password="Str0ngPass!23"
        )

    def test_customer_cannot_list_users(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_users(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
