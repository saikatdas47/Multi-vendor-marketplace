from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SellerProfile
from products.models import Category, Product

from .models import Cart, CartItem, WishlistItem

User = get_user_model()


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


class CartTests(APITestCase):
    def setUp(self):
        self.seller_user, self.seller = make_seller()
        self.category = Category.objects.create(name="Audio", slug="audio")
        self.product = Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Headphones",
            slug="headphones",
            sku="HP-1",
            price=Decimal("120.00"),
            stock=5,
            status=Product.Status.PUBLISHED,
        )
        self.customer = User.objects.create_user(
            email="buyer@example.com", password="Str0ngPass!23"
        )
        self.client.force_authenticate(self.customer)

    def add(self, quantity=1, product=None):
        return self.client.post(
            "/api/v1/cart/items/",
            {"product": str((product or self.product).id), "quantity": quantity},
            format="json",
        )

    def test_anonymous_cannot_access_cart(self):
        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/cart/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cart_is_created_on_first_access(self):
        response = self.client.get("/api/v1/cart/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["items"], [])
        self.assertTrue(Cart.objects.filter(user=self.customer).exists())

    def test_add_item_returns_full_cart(self):
        response = self.add(2)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total_quantity"], 2)
        self.assertEqual(Decimal(response.data["subtotal"]), Decimal("240.00"))

    def test_adding_same_product_twice_merges(self):
        self.add(2)
        response = self.add(1)
        self.assertEqual(response.data["distinct_items"], 1)
        self.assertEqual(response.data["total_quantity"], 3)

    def test_cannot_exceed_stock_in_one_go(self):
        response = self.add(99)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("quantity", response.data)

    def test_cannot_exceed_stock_across_two_adds(self):
        self.add(4)
        response = self.add(3)  # 4 + 3 > 5
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CartItem.objects.get().quantity, 4)

    def test_seller_cannot_buy_own_product(self):
        self.client.force_authenticate(self.seller_user)
        response = self.add(1)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_draft_product_cannot_be_added(self):
        self.product.status = Product.Status.DRAFT
        self.product.save()
        response = self.add(1)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unit_price_is_snapshotted(self):
        self.add(1)
        self.product.price = Decimal("200.00")
        self.product.save()

        item = CartItem.objects.get()
        self.assertEqual(item.unit_price, Decimal("120.00"))
        self.assertTrue(item.price_changed)

        response = self.client.get("/api/v1/cart/")
        self.assertEqual(len(response.data["issues"]), 1)

    def test_resync_price_accepts_new_price(self):
        self.add(1)
        self.product.price = Decimal("200.00")
        self.product.save()
        item = CartItem.objects.get()

        response = self.client.post(f"/api/v1/cart/items/{item.id}/resync-price/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.unit_price, Decimal("200.00"))

    def test_update_quantity_respects_stock(self):
        self.add(1)
        item = CartItem.objects.get()
        ok = self.client.patch(
            f"/api/v1/cart/items/{item.id}/", {"quantity": 5}, format="json"
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

        too_many = self.client.patch(
            f"/api/v1/cart/items/{item.id}/", {"quantity": 6}, format="json"
        )
        self.assertEqual(too_many.status_code, status.HTTP_400_BAD_REQUEST)

    def test_remove_item(self):
        self.add(1)
        item = CartItem.objects.get()
        response = self.client.delete(f"/api/v1/cart/items/{item.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_cannot_touch_another_users_cart_item(self):
        self.add(1)
        item = CartItem.objects.get()

        intruder = User.objects.create_user(
            email="intruder@example.com", password="Str0ngPass!23"
        )
        self.client.force_authenticate(intruder)
        response = self.client.delete(f"/api/v1/cart/items/{item.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_clear_cart(self):
        self.add(2)
        response = self.client.delete("/api/v1/cart/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(CartItem.objects.count(), 0)


class WishlistTests(APITestCase):
    def setUp(self):
        _, seller = make_seller()
        category = Category.objects.create(name="Books", slug="books")
        self.product = Product.objects.create(
            seller=seller,
            category=category,
            name="Clean Code",
            slug="clean-code",
            sku="BK-1",
            price=Decimal("30.00"),
            stock=3,
            status=Product.Status.PUBLISHED,
        )
        self.customer = User.objects.create_user(
            email="reader@example.com", password="Str0ngPass!23"
        )
        self.client.force_authenticate(self.customer)

    def test_toggle_adds_then_removes(self):
        on = self.client.post(
            "/api/v1/wishlist/toggle/", {"product": str(self.product.id)}, format="json"
        )
        self.assertTrue(on.data["wishlisted"])
        self.assertEqual(WishlistItem.objects.count(), 1)

        off = self.client.post(
            "/api/v1/wishlist/toggle/", {"product": str(self.product.id)}, format="json"
        )
        self.assertFalse(off.data["wishlisted"])
        self.assertEqual(WishlistItem.objects.count(), 0)

    def test_move_to_cart_removes_from_wishlist(self):
        item = WishlistItem.objects.create(user=self.customer, product=self.product)
        response = self.client.post(f"/api/v1/wishlist/{item.id}/move-to-cart/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_quantity"], 1)
        self.assertEqual(WishlistItem.objects.count(), 0)

    def test_wishlist_is_per_user(self):
        WishlistItem.objects.create(user=self.customer, product=self.product)
        other = User.objects.create_user(
            email="other@example.com", password="Str0ngPass!23"
        )
        self.client.force_authenticate(other)
        response = self.client.get("/api/v1/wishlist/")
        self.assertEqual(response.data["count"], 0)
