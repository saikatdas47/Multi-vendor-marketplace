"""Assistant tests.

The LLM is always stubbed. What matters is that retrieval is correct, that the
assistant can only surface products that actually exist, and that the whole
feature degrades to plain search when AI is unavailable.
"""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SellerProfile
from core.ai import AIUnavailable
from products.models import Category, Product

from .models import ChatMessage, ChatSession
from .retrieval import parse_constraints, retrieve, search_terms, to_context

User = get_user_model()

NO_THROTTLE = {
    "DEFAULT_THROTTLE_RATES": {"anon": None, "user": None, "email": None, "ai": None}
}

ASK_URL = "/api/v1/assistant/ask/"


def make_seller(email="seller@example.com"):
    user = User.objects.create_user(
        email=email, password="Str0ngPass!23", role=User.Role.SELLER
    )
    return SellerProfile.objects.create(
        user=user,
        shop_name=f"Shop {email.split('@')[0]}",
        slug=email.split("@")[0],
        status=SellerProfile.Status.APPROVED,
        approved_at=timezone.now(),
    )


class ConstraintParsingTests(APITestCase):
    """Pure functions — no database, no network."""

    def test_upper_bound_phrasings(self):
        for text, expected in [
            ("laptop under $1000", "1000"),
            ("phones below 500", "500"),
            ("less than 250", "250"),
            ("cheaper than 300", "300"),
            ("up to 99.99", "99.99"),
            ("no more than 40", "40"),
        ]:
            with self.subTest(text=text):
                self.assertEqual(
                    parse_constraints(text)["max_price"], Decimal(expected)
                )

    def test_lower_bound_phrasings(self):
        for text, expected in [
            ("headphones over $200", "200"),
            ("above 150", "150"),
            ("at least 100", "100"),
        ]:
            with self.subTest(text=text):
                self.assertEqual(
                    parse_constraints(text)["min_price"], Decimal(expected)
                )

    def test_range_phrasings(self):
        for text in ("between 200 and 500", "from 200 to 500", "$200-$500"):
            with self.subTest(text=text):
                parsed = parse_constraints(text)
                self.assertEqual(parsed["min_price"], Decimal("200"))
                self.assertEqual(parsed["max_price"], Decimal("500"))

    def test_range_is_normalised_when_reversed(self):
        parsed = parse_constraints("between 500 and 200")
        self.assertEqual(parsed["min_price"], Decimal("200"))
        self.assertEqual(parsed["max_price"], Decimal("500"))

    def test_intent_becomes_ordering(self):
        self.assertEqual(parse_constraints("cheapest mouse")["ordering"], "price")
        self.assertEqual(parse_constraints("premium watch")["ordering"], "-price")
        self.assertEqual(
            parse_constraints("best rated audio")["ordering"], "-avg_rating"
        )
        self.assertEqual(parse_constraints("newest arrivals")["ordering"], "-created_at")

    def test_no_constraints_when_none_stated(self):
        parsed = parse_constraints("what should I buy for a student")
        self.assertIsNone(parsed["min_price"])
        self.assertIsNone(parsed["max_price"])

    def test_search_terms_strip_filler_and_prices(self):
        terms = search_terms("I'm looking for a laptop under $1000")
        self.assertIn("laptop", terms)
        self.assertNotIn("1000", terms)
        self.assertNotIn("looking", terms)


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class RetrievalTests(APITestCase):
    def setUp(self):
        self.seller = make_seller()
        self.laptops = Category.objects.create(name="Laptops", slug="laptops")
        self.audio = Category.objects.create(name="Audio", slug="audio")

        self.cheap = self.make("Budget Laptop", "800.00", self.laptops, stock=5)
        self.mid = self.make("Mid Laptop", "1200.00", self.laptops, stock=5)
        self.buds = self.make("Wireless Earbuds", "90.00", self.audio, stock=5)
        self.gone = self.make("Sold Out Laptop", "950.00", self.laptops, stock=0)

    def make(self, name, price, category, stock=5, status_=Product.Status.PUBLISHED):
        return Product.objects.create(
            seller=self.seller,
            category=category,
            name=name,
            slug=name.lower().replace(" ", "-"),
            sku=name[:8].upper().replace(" ", ""),
            short_description=f"A {name}.",
            price=Decimal(price),
            stock=stock,
            status=status_,
        )

    def test_price_ceiling_is_applied(self):
        products, meta = retrieve("laptop under 1000")
        names = [p.name for p in products]
        self.assertIn("Budget Laptop", names)
        self.assertNotIn("Mid Laptop", names)
        self.assertEqual(meta["max_price"], "1000")

    def test_category_is_matched_from_real_names_only(self):
        products, meta = retrieve("show me audio")
        self.assertIsNotNone(meta["category_id"])
        self.assertTrue(all(p.category_id == self.audio.id for p in products))

    def test_unknown_category_is_not_invented(self):
        _, meta = retrieve("show me submarines")
        self.assertIsNone(meta["category_id"])

    def test_unpublished_products_are_never_retrieved(self):
        draft = self.make("Secret Laptop", "500.00", self.laptops, status_=Product.Status.DRAFT)
        products, _ = retrieve("laptop")
        self.assertNotIn(draft.id, [p.id for p in products])

    def test_in_stock_items_are_ranked_first(self):
        products, _ = retrieve("laptop")
        stocks = [p.stock for p in products]
        # No zero-stock item may appear before an in-stock one.
        first_zero = next((i for i, s in enumerate(stocks) if s == 0), len(stocks))
        self.assertTrue(all(s > 0 for s in stocks[:first_zero]))

    def test_cheapest_orders_ascending(self):
        products, meta = retrieve("cheapest laptop")
        self.assertEqual(meta["ordering"], "price")
        prices = [p.price for p in products]
        self.assertEqual(prices, sorted(prices))

    def test_empty_catalogue_returns_empty_not_error(self):
        Product.all_objects.all().delete()
        products, meta = retrieve("anything")
        self.assertEqual(products, [])
        self.assertEqual(meta["count"], 0)

    def test_context_is_numbered_and_flags_stock(self):
        context = to_context([self.cheap, self.gone])
        self.assertIn("[1]", context)
        self.assertIn("[2]", context)
        self.assertIn("OUT OF STOCK", context)
        # Prices must be present so the model never has to guess one.
        self.assertIn("800", context)


@override_settings(REST_FRAMEWORK=NO_THROTTLE, AI_ENABLED=True)
class AskEndpointTests(APITestCase):
    def setUp(self):
        self.seller = make_seller()
        category = Category.objects.create(name="Laptops", slug="laptops")
        self.product = Product.objects.create(
            seller=self.seller,
            category=category,
            name="Budget Laptop",
            slug="budget-laptop",
            sku="BL-1",
            price=Decimal("800.00"),
            stock=4,
            status=Product.Status.PUBLISHED,
        )

    @patch("assistant.services.chat")
    def test_guest_can_ask(self, mocked):
        mocked.return_value = "The [1] fits your budget well."
        response = self.client.post(
            ASK_URL, {"message": "laptop under 1000"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["ai"])
        self.assertEqual(len(response.data["products"]), 1)
        self.assertIsNotNone(response.data["session_id"])

    @patch("assistant.services.chat")
    def test_only_cited_products_are_returned(self, mocked):
        """A reply citing nothing real must not surface phantom products."""
        for i in range(3):
            Product.objects.create(
                seller=self.seller,
                category=self.product.category,
                name=f"Extra Laptop {i}",
                slug=f"extra-{i}",
                sku=f"EX-{i}",
                price=Decimal("700.00"),
                stock=2,
                status=Product.Status.PUBLISHED,
            )
        mocked.return_value = "I recommend the [2] specifically."
        response = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        self.assertEqual(len(response.data["products"]), 1)

    @patch("assistant.services.chat")
    def test_citations_beyond_the_shortlist_are_ignored(self, mocked):
        """[99] doesn't exist — it must not crash or fabricate."""
        mocked.return_value = "Try the [99] or the [1]."
        response = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["products"]), 1)

    @patch("assistant.services.chat")
    def test_products_are_reread_from_the_database(self, mocked):
        """Price shown must be live, not whatever was in the prompt."""
        mocked.return_value = "The [1] is good."
        self.client.post(ASK_URL, {"message": "laptop"}, format="json")

        self.product.price = Decimal("650.00")
        self.product.save()

        response = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        self.assertEqual(Decimal(response.data["products"][0]["price"]), Decimal("650.00"))

    @patch("assistant.services.chat")
    def test_conversation_is_persisted(self, mocked):
        mocked.return_value = "Sure, the [1] works."
        first = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        session_id = first.data["session_id"]

        self.client.post(
            ASK_URL,
            {"message": "anything cheaper?", "session_id": session_id},
            format="json",
        )

        session = ChatSession.objects.get(pk=session_id)
        self.assertEqual(session.messages.count(), 4)  # 2 user + 2 assistant
        self.assertEqual(session.title, "laptop")

    @patch("assistant.services.chat")
    def test_history_is_replayable(self, mocked):
        mocked.return_value = "The [1] is a solid pick."
        ask = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        session_id = ask.data["session_id"]

        history = self.client.get(f"/api/v1/assistant/history/{session_id}/")
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(len(history.data["messages"]), 2)
        self.assertEqual(len(history.data["messages"][1]["products"]), 1)

    @patch("assistant.services.chat")
    def test_another_users_session_is_not_readable(self, mocked):
        mocked.return_value = "The [1] is fine."
        owner = User.objects.create_user(email="owner@example.com", password="Str0ngPass!23")
        self.client.force_authenticate(owner)
        ask = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        session_id = ask.data["session_id"]

        intruder = User.objects.create_user(email="nosy@example.com", password="Str0ngPass!23")
        self.client.force_authenticate(intruder)
        response = self.client.get(f"/api/v1/assistant/history/{session_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("assistant.services.chat")
    def test_guest_session_is_adopted_on_sign_in(self, mocked):
        mocked.return_value = "The [1] works."
        guest = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        session_id = guest.data["session_id"]
        self.assertIsNone(ChatSession.objects.get(pk=session_id).user_id)

        user = User.objects.create_user(email="later@example.com", password="Str0ngPass!23")
        self.client.force_authenticate(user)
        self.client.post(
            ASK_URL, {"message": "and cheaper?", "session_id": session_id}, format="json"
        )
        self.assertEqual(ChatSession.objects.get(pk=session_id).user_id, user.id)

    @patch("assistant.services.chat")
    def test_retrieval_meta_is_recorded_for_debugging(self, mocked):
        mocked.return_value = "The [1] fits."
        self.client.post(ASK_URL, {"message": "laptop under 1000"}, format="json")
        message = ChatMessage.objects.filter(role="assistant").first()
        self.assertEqual(message.retrieval_meta["max_price"], "1000")
        self.assertIn("strategy", message.retrieval_meta)

    def test_short_message_is_rejected(self):
        response = self.client.post(ASK_URL, {"message": "a"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("assistant.services.chat")
    def test_llm_outage_degrades_to_search(self, mocked):
        mocked.side_effect = AIUnavailable("The AI service is temporarily unavailable.")
        response = self.client.post(ASK_URL, {"message": "laptop"}, format="json")

        # Still a 200 with real products — the customer gets something useful.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["ai"])
        self.assertEqual(len(response.data["products"]), 1)

    @override_settings(AI_ENABLED=False)
    def test_no_api_key_degrades_to_search(self):
        response = self.client.post(ASK_URL, {"message": "laptop"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["ai"])
        self.assertEqual(len(response.data["products"]), 1)
        # No LLM call means no conversation to store.
        self.assertEqual(ChatSession.objects.count(), 0)

    def test_suggestions_are_public(self):
        response = self.client.get("/api/v1/assistant/suggestions/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data["suggestions"]) >= 3)


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class SessionListTests(APITestCase):
    def test_sessions_are_private(self):
        owner = User.objects.create_user(email="a@example.com", password="Str0ngPass!23")
        other = User.objects.create_user(email="b@example.com", password="Str0ngPass!23")
        ChatSession.objects.create(user=owner, title="Mine")

        self.client.force_authenticate(other)
        response = self.client.get("/api/v1/assistant/sessions/")
        self.assertEqual(response.data["count"], 0)

        self.client.force_authenticate(owner)
        response = self.client.get("/api/v1/assistant/sessions/")
        self.assertEqual(response.data["count"], 1)

    def test_anonymous_cannot_list_sessions(self):
        response = self.client.get("/api/v1/assistant/sessions/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class SearchSuggestTests(APITestCase):
    """The search bar's data source. No LLM is involved, so nothing is mocked."""

    url = "/api/v1/assistant/suggest/"

    def setUp(self):
        self.seller = make_seller()
        self.laptops = Category.objects.create(name="Laptops", slug="laptops")
        self.audio = Category.objects.create(name="Audio", slug="audio")

        for name, price, category in [
            ("Budget Laptop", "800.00", self.laptops),
            ("Premium Laptop", "2400.00", self.laptops),
            ("Wireless Earbuds", "90.00", self.audio),
        ]:
            Product.objects.create(
                seller=self.seller,
                category=category,
                name=name,
                slug=name.lower().replace(" ", "-"),
                sku=name[:8].upper().replace(" ", ""),
                short_description=f"A {name}.",
                price=Decimal(price),
                stock=5,
                status=Product.Status.PUBLISHED,
            )

    def test_works_for_guests(self):
        response = self.client.get(self.url, {"q": "laptop"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data["products"]) >= 1)

    def test_short_query_returns_empty_without_querying(self):
        response = self.client.get(self.url, {"q": "a"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["products"], [])
        self.assertEqual(response.data["understood"], {})

    def test_missing_query_is_not_an_error(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_parsed_price_is_reported_back(self):
        """The UI shows these as chips, so they have to be accurate."""
        response = self.client.get(self.url, {"q": "laptop under 1000"})
        self.assertEqual(response.data["understood"]["max_price"], "1000")
        names = [p["name"] for p in response.data["products"]]
        self.assertIn("Budget Laptop", names)
        self.assertNotIn("Premium Laptop", names)

    def test_parsed_ordering_is_reported_back(self):
        response = self.client.get(self.url, {"q": "cheapest laptop"})
        self.assertEqual(response.data["understood"]["ordering"], "price")

    def test_parsed_category_is_reported_back(self):
        response = self.client.get(self.url, {"q": "audio"})
        self.assertEqual(response.data["understood"]["category"]["slug"], "audio")

    def test_category_jumps_are_offered(self):
        response = self.client.get(self.url, {"q": "laptop"})
        slugs = [c["slug"] for c in response.data["categories"]]
        self.assertIn("laptops", slugs)

    def test_limit_is_clamped(self):
        response = self.client.get(self.url, {"q": "laptop", "limit": "999"})
        self.assertLessEqual(len(response.data["products"]), 10)

    def test_garbage_limit_falls_back_to_default(self):
        response = self.client.get(self.url, {"q": "laptop", "limit": "abc"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_draft_products_never_appear(self):
        draft = Product.objects.create(
            seller=self.seller,
            category=self.laptops,
            name="Secret Laptop",
            slug="secret-laptop",
            sku="SEC-1",
            price=Decimal("100.00"),
            stock=5,
            status=Product.Status.DRAFT,
        )
        response = self.client.get(self.url, {"q": "laptop"})
        self.assertNotIn(str(draft.id), [p["id"] for p in response.data["products"]])
