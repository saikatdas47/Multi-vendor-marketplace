from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Address, SellerProfile
from cart.models import Cart, CartItem
from products.models import Category, Product

from .models import Order, OrderItem, OrderStatus

User = get_user_model()

NO_THROTTLE = {
    "DEFAULT_THROTTLE_RATES": {"anon": None, "user": None, "email": None, "ai": None}
}


def make_seller(email="seller@example.com"):
    user = User.objects.create_user(
        email=email, password="Str0ngPass!23", role=User.Role.SELLER
    )
    profile = SellerProfile.objects.create(
        user=user,
        shop_name=f"Shop {email}",
        slug=email.split("@")[0],
        status=SellerProfile.Status.APPROVED,
        approved_at=timezone.now(),
    )
    return user, profile


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class CheckoutTests(APITestCase):
    def setUp(self):
        self.seller_user, self.seller = make_seller()
        self.category = Category.objects.create(name="Audio", slug="audio")
        self.product = Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Headphones",
            slug="headphones",
            sku="HP-1",
            price=Decimal("100.00"),
            stock=10,
            status=Product.Status.PUBLISHED,
        )
        self.customer = User.objects.create_user(
            email="buyer@example.com", password="Str0ngPass!23"
        )
        self.address = Address.objects.create(
            user=self.customer,
            full_name="Buyer One",
            phone="+8801700000000",
            line1="12 Test Road",
            city="Dhaka",
            postal_code="1207",
            country="Bangladesh",
            is_default=True,
        )
        self.client.force_authenticate(self.customer)

    def fill_cart(self, quantity=2, product=None):
        product = product or self.product
        cart, _ = Cart.objects.get_or_create(user=self.customer)
        return CartItem.objects.create(
            cart=cart, product=product, quantity=quantity, unit_price=product.price
        )

    def checkout(self, **overrides):
        payload = {"address": str(self.address.id), "payment_method": "cod"}
        payload.update(overrides)
        return self.client.post("/api/v1/checkout/", payload, format="json")

    def test_anonymous_cannot_checkout(self):
        self.client.force_authenticate(None)
        response = self.checkout()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_cart_is_rejected(self):
        response = self.checkout()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())

    def test_checkout_creates_order_and_deducts_stock(self):
        self.fill_cart(3)
        response = self.checkout()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["total"]), Decimal("300.00"))

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

    def test_checkout_clears_the_cart(self):
        """Otherwise a refresh or double-click buys everything twice."""
        self.fill_cart(2)
        self.checkout()
        self.assertEqual(CartItem.objects.count(), 0)

    def test_order_snapshots_product_details(self):
        self.fill_cart(1)
        self.checkout()
        item = OrderItem.objects.get()

        # Seller renames and reprices after the sale.
        self.product.name = "Renamed Headphones"
        self.product.price = Decimal("999.00")
        self.product.save()

        item.refresh_from_db()
        self.assertEqual(item.product_name, "Headphones")
        self.assertEqual(item.unit_price, Decimal("100.00"))
        self.assertEqual(item.seller_name, self.seller.shop_name)

    def test_order_survives_product_deletion(self):
        self.fill_cart(1)
        self.checkout()
        self.product.delete()  # soft delete

        item = OrderItem.objects.get()
        self.assertEqual(item.product_name, "Headphones")
        self.assertEqual(Order.objects.count(), 1)

    def test_cannot_order_more_than_stock(self):
        self.fill_cart(50)
        response = self.checkout()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("issues", response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertFalse(Order.objects.exists())

    def test_draft_product_cannot_be_ordered(self):
        self.fill_cart(1)
        self.product.status = Product.Status.DRAFT
        self.product.save()

        response = self.checkout()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())

    def test_nothing_is_committed_when_one_line_fails(self):
        """A partially valid cart must not produce a partial order."""
        second = Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Speaker",
            slug="speaker",
            sku="SP-1",
            price=Decimal("50.00"),
            stock=1,
            status=Product.Status.PUBLISHED,
        )
        self.fill_cart(1)
        self.fill_cart(5, product=second)  # only 1 in stock

        response = self.checkout()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())
        self.product.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertEqual(second.stock, 1)

    def test_someone_elses_address_is_rejected(self):
        other = User.objects.create_user(
            email="other@example.com", password="Str0ngPass!23"
        )
        stranger_address = Address.objects.create(
            user=other,
            full_name="Someone Else",
            phone="1",
            line1="x",
            city="y",
            postal_code="z",
        )
        self.fill_cart(1)
        response = self.checkout(address=str(stranger_address.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_address_is_copied_not_referenced(self):
        self.fill_cart(1)
        self.checkout()

        self.address.line1 = "Completely different street"
        self.address.save()

        order = Order.objects.get()
        self.assertEqual(order.ship_to_line1, "12 Test Road")

    def test_multi_seller_cart_becomes_one_order(self):
        _, other_seller = make_seller("seller2@example.com")
        other_product = Product.objects.create(
            seller=other_seller,
            category=self.category,
            name="Amp",
            slug="amp",
            sku="AMP-1",
            price=Decimal("200.00"),
            stock=5,
            status=Product.Status.PUBLISHED,
        )
        self.fill_cart(1)
        self.fill_cart(1, product=other_product)

        response = self.checkout()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(OrderItem.objects.count(), 2)


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class OrderAccessTests(APITestCase):
    def setUp(self):
        _, self.seller = make_seller()
        category = Category.objects.create(name="Books", slug="books")
        self.product = Product.objects.create(
            seller=self.seller,
            category=category,
            name="Book",
            slug="book",
            sku="BK-1",
            price=Decimal("20.00"),
            stock=5,
            status=Product.Status.PUBLISHED,
        )
        self.customer = User.objects.create_user(
            email="c1@example.com", password="Str0ngPass!23"
        )
        self.order = Order.objects.create(
            customer=self.customer,
            customer_email=self.customer.email,
            ship_to_name="C One",
            ship_to_phone="1",
            ship_to_line1="a",
            ship_to_city="b",
            ship_to_postal_code="c",
            ship_to_country="Bangladesh",
        )
        OrderItem.objects.create(
            order=self.order,
            product=self.product,
            seller=self.seller,
            product_name="Book",
            product_sku="BK-1",
            seller_name=self.seller.shop_name,
            unit_price=Decimal("20.00"),
            quantity=2,
        )
        self.order.recalculate_totals()

    def test_customer_sees_only_their_own_orders(self):
        intruder = User.objects.create_user(
            email="nosy@example.com", password="Str0ngPass!23"
        )
        self.client.force_authenticate(intruder)

        listing = self.client.get("/api/v1/orders/")
        self.assertEqual(listing.data["count"], 0)

        detail = self.client.get(f"/api/v1/orders/{self.order.number}/")
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_can_read_their_order(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(f"/api/v1/orders/{self.order.number}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertIn("events", response.data)

    def test_order_numbers_are_not_sequential(self):
        second = Order.objects.create(
            customer=self.customer,
            customer_email=self.customer.email,
            ship_to_name="x", ship_to_phone="1", ship_to_line1="a",
            ship_to_city="b", ship_to_postal_code="c", ship_to_country="BD",
        )
        self.assertNotEqual(self.order.number, second.number)
        self.assertTrue(second.number.startswith("CX-"))


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class CancelAndFulfilmentTests(APITestCase):
    def setUp(self):
        self.seller_user, self.seller = make_seller()
        category = Category.objects.create(name="Tools", slug="tools")
        self.product = Product.objects.create(
            seller=self.seller,
            category=category,
            name="Drill",
            slug="drill",
            sku="DR-1",
            price=Decimal("80.00"),
            stock=10,
            status=Product.Status.PUBLISHED,
        )
        self.customer = User.objects.create_user(
            email="buyer2@example.com", password="Str0ngPass!23"
        )
        self.address = Address.objects.create(
            user=self.customer,
            full_name="B Two",
            phone="1",
            line1="a",
            city="b",
            postal_code="c",
        )
        cart, _ = Cart.objects.get_or_create(user=self.customer)
        CartItem.objects.create(
            cart=cart, product=self.product, quantity=3, unit_price=Decimal("80.00")
        )
        self.client.force_authenticate(self.customer)
        self.client.post(
            "/api/v1/checkout/",
            {"address": str(self.address.id), "payment_method": "cod"},
            format="json",
        )
        self.order = Order.objects.get()
        self.item = self.order.items.get()

    def test_cancelling_restores_stock(self):
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

        response = self.client.post(
            f"/api/v1/orders/{self.order.number}/cancel/",
            {"reason": "Changed my mind"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, OrderStatus.CANCELLED)

    def test_stock_is_restored_only_once(self):
        """Double-cancelling must not mint free inventory."""
        self.client.post(
            f"/api/v1/orders/{self.order.number}/cancel/", {}, format="json"
        )
        self.client.post(
            f"/api/v1/orders/{self.order.number}/cancel/", {}, format="json"
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_customer_cannot_cancel_after_packing(self):
        self.item.status = OrderStatus.PACKED
        self.item.save()
        self.order.sync_status_from_items()

        response = self.client.post(
            f"/api/v1/orders/{self.order.number}/cancel/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)

    def test_seller_advances_their_own_line(self):
        self.client.force_authenticate(self.seller_user)
        response = self.client.post(
            f"/api/v1/seller/order-items/{self.item.id}/status/",
            {"status": "confirmed"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, OrderStatus.CONFIRMED)

    def test_illegal_transition_is_rejected(self):
        """pending -> delivered skips the whole fulfilment chain."""
        self.client.force_authenticate(self.seller_user)
        response = self.client.post(
            f"/api/v1/seller/order-items/{self.item.id}/status/",
            {"status": "delivered"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, OrderStatus.PENDING)

    def test_seller_cannot_touch_another_sellers_line(self):
        rival_user, _ = make_seller("rival@example.com")
        self.client.force_authenticate(rival_user)
        response = self.client.post(
            f"/api/v1/seller/order-items/{self.item.id}/status/",
            {"status": "confirmed"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_seller_only_lists_their_own_lines(self):
        rival_user, _ = make_seller("rival2@example.com")
        self.client.force_authenticate(rival_user)
        response = self.client.get("/api/v1/seller/order-items/")
        self.assertEqual(response.data["count"], 0)

    def test_customer_cannot_use_seller_endpoint(self):
        response = self.client.get("/api/v1/seller/order-items/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_seller_cancelling_a_line_restores_stock(self):
        self.client.force_authenticate(self.seller_user)
        self.client.post(
            f"/api/v1/seller/order-items/{self.item.id}/status/",
            {"status": "cancelled", "note": "Damaged in the warehouse"},
            format="json",
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_events_build_a_timeline(self):
        self.client.force_authenticate(self.seller_user)
        self.client.post(
            f"/api/v1/seller/order-items/{self.item.id}/status/",
            {"status": "confirmed"},
            format="json",
        )
        self.client.force_authenticate(self.customer)
        response = self.client.get(f"/api/v1/orders/{self.order.number}/")
        statuses = [e["status"] for e in response.data["events"]]
        self.assertIn("pending", statuses)
        self.assertIn("confirmed", statuses)

    def test_order_status_follows_the_slowest_item(self):
        """With two sellers, the order isn't 'shipped' until both have shipped."""
        _, other_seller = make_seller("s3@example.com")
        second = OrderItem.objects.create(
            order=self.order,
            product=self.product,
            seller=other_seller,
            product_name="Drill",
            product_sku="DR-2",
            seller_name=other_seller.shop_name,
            unit_price=Decimal("80.00"),
            quantity=1,
        )
        self.item.status = OrderStatus.SHIPPED
        self.item.save()
        self.order.sync_status_from_items()
        self.assertEqual(self.order.status, OrderStatus.PENDING)

        second.status = OrderStatus.SHIPPED
        second.save()
        self.order.sync_status_from_items()
        self.assertEqual(self.order.status, OrderStatus.SHIPPED)


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class AdminOrderTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin@example.com", password="Str0ngPass!23"
        )
        self.customer = User.objects.create_user(
            email="c9@example.com", password="Str0ngPass!23"
        )
        self.order = Order.objects.create(
            customer=self.customer,
            customer_email=self.customer.email,
            ship_to_name="x", ship_to_phone="1", ship_to_line1="a",
            ship_to_city="b", ship_to_postal_code="c", ship_to_country="BD",
            total=Decimal("50.00"),
        )

    def test_customer_cannot_list_all_orders(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_and_mark_paid(self):
        self.client.force_authenticate(self.admin)
        listing = self.client.get("/api/v1/admin/orders/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)

        paid = self.client.post(f"/api/v1/admin/orders/{self.order.number}/mark-paid/")
        self.assertEqual(paid.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, "paid")

    def test_admin_stats(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/orders/stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("revenue", response.data)
        self.assertIn("by_status", response.data)
