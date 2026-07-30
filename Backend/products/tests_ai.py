"""AI endpoint behaviour, with the provider stubbed out.

These tests never call Groq. What matters is that the app degrades cleanly when
AI is unavailable, that the endpoints are permission-gated, and that responses
are cached so repeat requests don't re-bill.
"""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SellerProfile
from core.ai import AIUnavailable

from .models import Category, Product, Review

User = get_user_model()

NO_THROTTLE = {
    "DEFAULT_THROTTLE_RATES": {"anon": None, "user": None, "email": None, "ai": None}
}


def make_seller(email="seller@example.com", approved=True):
    user = User.objects.create_user(
        email=email, password="Str0ngPass!23", role=User.Role.SELLER
    )
    profile = SellerProfile.objects.create(
        user=user,
        shop_name=f"Shop {email}",
        slug=email.split("@")[0],
        status=SellerProfile.Status.APPROVED
        if approved
        else SellerProfile.Status.PENDING,
        approved_at=timezone.now() if approved else None,
    )
    return user, profile


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class DraftListingTests(APITestCase):
    url = "/api/v1/ai/draft-listing/"

    def setUp(self):
        cache.clear()
        self.seller_user, self.seller = make_seller()
        self.category = Category.objects.create(name="Audio", slug="audio")

    def payload(self):
        return {"name": "Wireless Earbuds", "category": str(self.category.id)}

    def test_anonymous_denied(self):
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_customer_denied(self):
        customer = User.objects.create_user(
            email="c@example.com", password="Str0ngPass!23"
        )
        self.client.force_authenticate(customer)
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unapproved_seller_denied(self):
        user, _ = make_seller("pending@example.com", approved=False)
        self.client.force_authenticate(user)
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("products.views_ai.draft_product_listing")
    def test_approved_seller_gets_all_four_fields(self, mocked):
        mocked.return_value = {
            "seo_title": "Wireless Earbuds — 30h Battery",
            "description": "A crisp pair of earbuds.",
            "bullets": ["30 hour battery", "USB-C charging"],
            "meta_description": "Crisp wireless earbuds with 30h battery.",
        }
        self.client.force_authenticate(self.seller_user)

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["description"], "A crisp pair of earbuds.")
        self.assertEqual(len(response.data["bullets"]), 2)
        self.assertIn("seo_title", response.data)
        self.assertIn("meta_description", response.data)
        self.assertIn("check every claim", response.data["notice"].lower())

    @patch("products.views_ai.draft_product_listing")
    def test_features_are_forwarded_to_the_prompt(self, mocked):
        """The seller's specs must reach the model, or it will invent some."""
        mocked.return_value = {
            "seo_title": "x", "description": "y", "bullets": [], "meta_description": "z",
        }
        self.client.force_authenticate(self.seller_user)
        self.client.post(
            self.url,
            {**self.payload(), "brand": "Logitech", "features": "RGB, 16000 DPI"},
            format="json",
        )
        kwargs = mocked.call_args.kwargs
        self.assertEqual(kwargs["brand"], "Logitech")
        self.assertIn("16000 DPI", kwargs["features"])

    @patch("products.views_ai.draft_product_listing")
    def test_returns_503_when_ai_unconfigured(self, mocked):
        mocked.side_effect = AIUnavailable("AI features are not configured.")
        self.client.force_authenticate(self.seller_user)

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("detail", response.data)

    def test_name_is_required(self):
        self.client.force_authenticate(self.seller_user)
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    @patch("products.views_ai.draft_product_listing")
    def test_nothing_is_persisted(self, mocked):
        """The draft is a suggestion - it must not create or edit a product."""
        mocked.return_value = {
            "seo_title": "t", "description": "Copy.", "bullets": [], "meta_description": "m",
        }
        self.client.force_authenticate(self.seller_user)
        self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(Product.objects.count(), 0)


@override_settings(REST_FRAMEWORK=NO_THROTTLE, AI_ENABLED=True)
class ReviewSummaryTests(APITestCase):
    def setUp(self):
        cache.clear()
        _, seller = make_seller()
        category = Category.objects.create(name="Books", slug="books")
        self.product = Product.objects.create(
            seller=seller,
            category=category,
            name="Clean Code",
            slug="clean-code",
            sku="BK-1",
            price=Decimal("30.00"),
            stock=5,
            status=Product.Status.PUBLISHED,
        )
        self.url = f"/api/v1/products/{self.product.slug}/ai-summary/"

    def add_reviews(self, count):
        for i in range(count):
            user = User.objects.create_user(
                email=f"r{i}@example.com", password="Str0ngPass!23"
            )
            Review.objects.create(
                product=self.product,
                user=user,
                rating=5,
                comment=f"Really useful book, number {i}.",
            )

    @override_settings(AI_ENABLED=False)
    def test_204_when_ai_disabled(self):
        self.add_reviews(5)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    @patch("products.views_ai.summarise_reviews")
    def test_204_when_too_few_reviews(self, mocked):
        mocked.side_effect = AIUnavailable("Not enough reviews.")
        self.add_reviews(1)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    @patch("products.views_ai.summarise_reviews")
    def test_summary_available_to_anonymous_shoppers(self, mocked):
        mocked.return_value = "Reviewers praise the clarity."
        self.add_reviews(5)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"], "Reviewers praise the clarity.")
        self.assertEqual(response.data["based_on"], 5)

    @patch("products.views_ai.summarise_reviews")
    def test_at_most_25_reviews_are_sent(self, mocked):
        """Cost control: a product with 40 reviews must not send all 40."""
        mocked.return_value = "Summary."
        self.add_reviews(30)

        self.client.get(self.url)
        sent = mocked.call_args.kwargs["reviews"]
        self.assertLessEqual(len(sent), 25)

    def test_unknown_product_returns_404(self):
        response = self.client.get("/api/v1/products/does-not-exist/ai-summary/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AIServiceTests(APITestCase):
    """Unit-level checks on the service layer itself."""

    @override_settings(AI_ENABLED=False)
    def test_complete_raises_when_disabled(self):
        from core.ai import complete

        with self.assertRaises(AIUnavailable):
            complete("system", "user")

    def test_summarise_refuses_with_too_few_reviews(self):
        from core.ai import summarise_reviews

        with self.assertRaises(AIUnavailable):
            summarise_reviews(product_name="X", reviews=[(5, "Good")])

    def test_summarise_ignores_empty_comments(self):
        from core.ai import summarise_reviews

        with self.assertRaises(AIUnavailable):
            summarise_reviews(
                product_name="X", reviews=[(5, ""), (4, "   "), (3, None)]
            )
