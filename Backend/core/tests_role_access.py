"""The permission matrix, as executable assertions.

Every role is logged in and pointed at every other role's endpoints. This is the
test that would have caught the hole this refactor closed: cart, wishlist,
checkout and the order history were all `IsAuthenticated`, so a seller with a
valid JWT could add to a cart and check out. Route guards in React hid the UI;
they did nothing about curl.

The matrix is data, not code, so adding an endpoint means adding a row.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SellerProfile
from products.models import Category, Product

User = get_user_model()

# Throttles off: the matrix fires a few hundred requests and would otherwise
# start failing with 429 partway through, which looks like a permission bug.
NO_THROTTLE = {
    "DEFAULT_THROTTLE_RATES": {"anon": None, "user": None, "email": None, "ai": None}
}

API = "/api/v1"

# (label, method, path) -> the set of roles that must be ALLOWED.
# "anon" means an unauthenticated visitor.
CUSTOMER_ONLY = [
    ("cart", "get", f"{API}/cart/"),
    ("cart items", "post", f"{API}/cart/items/"),
    ("wishlist", "get", f"{API}/wishlist/"),
    ("checkout", "post", f"{API}/checkout/"),
    ("my orders", "get", f"{API}/orders/"),
    ("my addresses", "get", f"{API}/addresses/"),
    ("customer profile", "get", f"{API}/profile/customer/"),
]

SELLER_ONLY = [
    ("seller order items", "get", f"{API}/seller/order-items/"),
    ("seller notices", "get", f"{API}/seller/notices/"),
    ("seller notice unread", "get", f"{API}/seller/notices/unread-count/"),
    ("seller shop profile", "get", f"{API}/profile/seller/"),
    ("seller invoices", "get", f"{API}/seller/invoices/"),
    ("seller fee summary", "get", f"{API}/seller/invoices/summary/"),
    ("seller message thread", "get", f"{API}/seller/thread/"),
    ("seller thread unread", "get", f"{API}/seller/thread/unread-count/"),
]

ADMIN_ONLY = [
    ("admin sellers", "get", f"{API}/admin/sellers/"),
    ("admin notices", "get", f"{API}/admin/notices/"),
    ("admin audit logs", "get", f"{API}/admin/audit-logs/"),
    ("admin dashboard", "get", f"{API}/admin/dashboard/"),
    ("admin invoices", "get", f"{API}/admin/invoices/"),
    ("admin invoice summary", "get", f"{API}/admin/invoices/summary/"),
    ("admin conversations", "get", f"{API}/admin/conversations/"),
]

PUBLIC = [
    ("product list", "get", f"{API}/products/"),
    ("category list", "get", f"{API}/categories/"),
    ("shop directory", "get", f"{API}/shops/"),
]

# The assistant is open to visitors and customers, closed to seller and admin.
ASSISTANT = [
    ("assistant suggestions", "get", f"{API}/assistant/suggestions/"),
    ("assistant suggest", "get", f"{API}/assistant/suggest/?q=laptop"),
]

DENIED = {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class RoleAccessMatrixTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.customer = User.objects.create_user(
            email="matrix-customer@example.com",
            password="Str0ngPass!23",
            role=User.Role.CUSTOMER,
        )
        cls.seller_user = User.objects.create_user(
            email="matrix-seller@example.com",
            password="Str0ngPass!23",
            role=User.Role.SELLER,
        )
        cls.shop = SellerProfile.objects.create(
            user=cls.seller_user,
            shop_name="Matrix Shop",
            slug="matrix-shop",
            status=SellerProfile.Status.APPROVED,
            approved_at=timezone.now(),
        )
        cls.admin = User.objects.create_user(
            email="matrix-admin@example.com",
            password="Str0ngPass!23",
            role=User.Role.ADMIN,
            is_staff=True,
        )
        category = Category.objects.create(name="Matrix", slug="matrix")
        Product.objects.create(
            seller=cls.shop,
            category=category,
            name="Matrix Widget",
            slug="matrix-widget",
            sku="MTX-1",
            price=Decimal("10.00"),
            stock=5,
            status=Product.Status.PUBLISHED,
        )

    def as_role(self, role):
        self.client.logout()
        self.client.credentials()
        if role == "anon":
            return
        user = {"customer": self.customer, "seller": self.seller_user, "admin": self.admin}[role]
        self.client.force_authenticate(user=user)

    def call(self, method, path):
        # Empty bodies are fine: a 400 from validation still proves the
        # permission layer let the request through, which is what is under test.
        return getattr(self.client, method)(path, {}, format="json")

    def assert_access(self, rows, allowed):
        for label, method, path in rows:
            for role in ("anon", "customer", "seller", "admin"):
                with self.subTest(endpoint=label, role=role):
                    self.as_role(role)
                    response = self.call(method, path)
                    if role in allowed:
                        self.assertNotIn(
                            response.status_code,
                            DENIED,
                            f"{role} should reach {label} but got {response.status_code}",
                        )
                    else:
                        self.assertIn(
                            response.status_code,
                            DENIED,
                            f"{role} must NOT reach {label} but got {response.status_code}",
                        )

    def test_customer_only_endpoints(self):
        """This is the regression test for the hole that existed before.

        A seller or admin reaching /cart/ or /checkout/ was the actual bug: the
        views were `IsAuthenticated`, so any valid token passed.
        """
        self.assert_access(CUSTOMER_ONLY, allowed={"customer"})

    def test_seller_only_endpoints(self):
        self.assert_access(SELLER_ONLY, allowed={"seller"})

    def test_admin_only_endpoints(self):
        self.assert_access(ADMIN_ONLY, allowed={"admin"})

    def test_public_endpoints_are_public(self):
        # Sellers and admins are not blocked from the read-only catalogue API:
        # the separation there is a UI concern, and 403-ing a GET on
        # /products/ would break the seller's own product management, which
        # reads the same serializers.
        self.assert_access(PUBLIC, allowed={"anon", "customer", "seller", "admin"})

    def test_assistant_is_customer_facing_only(self):
        self.assert_access(ASSISTANT, allowed={"anon", "customer"})

    def test_assistant_ask_rejects_seller_and_admin(self):
        for role in ("seller", "admin"):
            with self.subTest(role=role):
                self.as_role(role)
                response = self.client.post(
                    f"{API}/assistant/ask/", {"message": "cheap laptop"}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_seller_cannot_read_another_shops_notices(self):
        """Scoping, not just role. A seller passing IsSeller must still only see
        their own mail."""
        other_user = User.objects.create_user(
            email="matrix-seller2@example.com",
            password="Str0ngPass!23",
            role=User.Role.SELLER,
        )
        other_shop = SellerProfile.objects.create(
            user=other_user,
            shop_name="Other Shop",
            slug="other-shop",
            status=SellerProfile.Status.APPROVED,
            approved_at=timezone.now(),
        )

        from notices.services import send_notice

        send_notice(
            author=self.admin,
            subject="Only for the other shop",
            body="Private",
            seller_ids=[other_shop.pk],
        )

        self.as_role("seller")
        response = self.client.get(f"{API}/seller/notices/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        rows = body if isinstance(body, list) else body.get("results", [])
        self.assertEqual(rows, [], "a seller must not see another shop's notices")
