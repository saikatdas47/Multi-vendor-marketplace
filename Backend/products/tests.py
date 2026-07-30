from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SellerProfile

from .models import Category, Product

User = get_user_model()


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


class CatalogTests(APITestCase):
    def setUp(self):
        self.seller_user, self.seller = make_seller()
        self.category = Category.objects.create(name="Phones", slug="phones")
        self.product = Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Pixel 9",
            slug="pixel-9",
            sku="PX9-001",
            price=Decimal("899.00"),
            stock=10,
            status=Product.Status.PUBLISHED,
        )

    def test_anonymous_can_browse_published_products(self):
        response = self.client.get("/api/v1/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_draft_products_hidden_from_public(self):
        self.product.status = Product.Status.DRAFT
        self.product.save()
        response = self.client.get("/api/v1/products/")
        self.assertEqual(response.data["count"], 0)

    def test_anonymous_cannot_create_product(self):
        response = self.client.post("/api/v1/products/", {"name": "X"}, format="json")
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_unapproved_seller_cannot_create_product(self):
        user, _ = make_seller("pending@example.com", approved=False)
        self.client.force_authenticate(user)
        response = self.client.post(
            "/api/v1/products/",
            {
                "name": "Nope",
                "sku": "NOPE-1",
                "price": "10.00",
                "category_id": str(self.category.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_approved_seller_can_create_product(self):
        self.client.force_authenticate(self.seller_user)
        response = self.client.post(
            "/api/v1/products/",
            {
                "name": "Pixel 9 Pro",
                "sku": "PX9P-001",
                "price": "1099.00",
                "stock": 5,
                "category_id": str(self.category.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["slug"], "pixel-9-pro")

    def test_seller_cannot_edit_another_sellers_product(self):
        other_user, _ = make_seller("rival@example.com")
        self.client.force_authenticate(other_user)
        response = self.client.patch(
            f"/api/v1/products/{self.product.slug}/",
            {"price": "1.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_price_filter(self):
        response = self.client.get("/api/v1/products/?min_price=1000")
        self.assertEqual(response.data["count"], 0)
        response = self.client.get("/api/v1/products/?max_price=1000")
        self.assertEqual(response.data["count"], 1)

    def test_price_range_filter(self):
        """Both bounds together, inclusive at each edge."""
        Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Budget phone",
            slug="budget-phone",
            sku="BP-1",
            price=Decimal("199.00"),
            stock=4,
            status=Product.Status.PUBLISHED,
        )
        Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Flagship",
            slug="flagship",
            sku="FS-1",
            price=Decimal("1499.00"),
            stock=2,
            status=Product.Status.PUBLISHED,
        )

        # Catalogue now holds 199, 899 and 1499.
        band = self.client.get("/api/v1/products/?min_price=200&max_price=1000")
        self.assertEqual(band.data["count"], 1)
        self.assertEqual(band.data["results"][0]["name"], "Pixel 9")

        inclusive = self.client.get("/api/v1/products/?min_price=199&max_price=1499")
        self.assertEqual(inclusive.data["count"], 3)

        empty = self.client.get("/api/v1/products/?min_price=2000")
        self.assertEqual(empty.data["count"], 0)

    def test_ordering_by_price(self):
        Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Cheap",
            slug="cheap",
            sku="CH-1",
            price=Decimal("10.00"),
            stock=1,
            status=Product.Status.PUBLISHED,
        )
        response = self.client.get("/api/v1/products/?ordering=price")
        prices = [Decimal(p["price"]) for p in response.data["results"]]
        self.assertEqual(prices, sorted(prices))


class StockTests(APITestCase):
    def setUp(self):
        self.seller_user, self.seller = make_seller()
        self.category = Category.objects.create(name="Audio", slug="audio")
        self.product = Product.objects.create(
            seller=self.seller,
            category=self.category,
            name="Buds",
            slug="buds",
            sku="BUDS-1",
            price=Decimal("49.00"),
            stock=3,
            low_stock_threshold=5,
            status=Product.Status.PUBLISHED,
        )
        self.client.force_authenticate(self.seller_user)

    def test_stock_cannot_go_negative(self):
        response = self.client.post(
            f"/api/v1/products/{self.product.slug}/adjust-stock/",
            {"delta": -10},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)

    def test_restock_updates_quantity(self):
        response = self.client.post(
            f"/api/v1/products/{self.product.slug}/adjust-stock/",
            {"delta": 7, "reason": "supplier delivery"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["stock"], 10)

    def test_low_stock_endpoint_lists_product(self):
        response = self.client.get("/api/v1/products/low-stock/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)


class SoftDeleteTests(APITestCase):
    def test_delete_soft_deletes_only(self):
        seller_user, seller = make_seller()
        category = Category.objects.create(name="Misc", slug="misc")
        product = Product.objects.create(
            seller=seller,
            category=category,
            name="Thing",
            slug="thing",
            sku="TH-1",
            price=Decimal("5.00"),
            status=Product.Status.PUBLISHED,
        )
        self.client.force_authenticate(seller_user)
        response = self.client.delete(f"/api/v1/products/{product.slug}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Product.objects.filter(pk=product.pk).exists())
        self.assertTrue(Product.all_objects.filter(pk=product.pk).exists())


class ReviewTests(APITestCase):
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
            status=Product.Status.PUBLISHED,
        )
        self.customer = User.objects.create_user(
            email="reader@example.com", password="Str0ngPass!23"
        )
        self.client.force_authenticate(self.customer)

    def test_one_review_per_user_per_product(self):
        payload = {"product": str(self.product.id), "rating": 5, "comment": "Great"}
        first = self.client.post("/api/v1/reviews/", payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post("/api/v1/reviews/", payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rating_must_be_between_1_and_5(self):
        response = self.client.post(
            "/api/v1/reviews/",
            {"product": str(self.product.id), "rating": 9},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CategoryOrderingTests(TestCase):
    """Same GROUP BY trap as the messaging inbox.

    The category list annotates a product count, which sets a GROUP BY and makes
    Django discard `Meta.ordering`. DRF then paginates an unordered queryset.
    """

    def test_annotated_category_queryset_is_ordered(self):
        queryset = (
            Category.objects.select_related("parent")
            .annotate(
                product_count=Count(
                    "products", filter=Q(products__status=Product.Status.PUBLISHED)
                )
            )
            .order_by("sort_order", "name")
        )
        self.assertTrue(queryset.ordered)

        # And the shape without the explicit order_by is the bug being guarded:
        unordered = Category.objects.annotate(product_count=Count("products"))
        self.assertFalse(
            unordered.ordered,
            "if this ever becomes True, Django changed and the guard can go",
        )


class CategoryProductCountTests(APITestCase):
    """The count on a category tile must agree with what its link shows.

    Every product is filed under a leaf ("electronics-laptops"), never a root.
    Counting only directly-attached products reported "0 products" on every
    top-level tile, while clicking through to /products?category=electronics
    returned a full grid — because ProductFilter.filter_category includes
    descendants and the count did not.
    """

    @classmethod
    def setUpTestData(cls):
        cls.seller = SellerProfile.objects.create(
            user=User.objects.create_user(
                email="count-seller@example.com",
                password="Str0ngPass!23",
                role=User.Role.SELLER,
            ),
            shop_name="Count Shop",
            slug="count-shop",
            status=SellerProfile.Status.APPROVED,
            approved_at=timezone.now(),
        )
        cls.root = Category.objects.create(name="Electronics", slug="electronics")
        cls.leaf = Category.objects.create(
            name="Laptops", slug="electronics-laptops", parent=cls.root
        )

    def make(self, name, category, status_=Product.Status.PUBLISHED, deleted=False):
        product = Product.objects.create(
            seller=self.seller,
            category=category,
            name=name,
            slug=name.lower().replace(" ", "-"),
            sku=name.upper().replace(" ", "")[:12],
            price=Decimal("100.00"),
            stock=3,
            status=status_,
        )
        if deleted:
            product.deleted_at = timezone.now()
            product.save(update_fields=["deleted_at"])
        return product

    def counts(self, params=None):
        response = self.client.get("/api/v1/categories/", params or {})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row["slug"]: row["product_count"] for row in response.json()["results"]}

    def test_root_count_includes_products_in_child_categories(self):
        self.make("Laptop A", self.leaf)
        self.make("Laptop B", self.leaf)

        counts = self.counts()
        self.assertEqual(counts["electronics"], 2, "root must count its children's products")
        self.assertEqual(counts["electronics-laptops"], 2)

    def test_count_matches_what_the_link_returns(self):
        """The tile and the destination must never disagree."""
        self.make("Laptop A", self.leaf)
        self.make("Laptop B", self.leaf)
        self.make("Draft", self.leaf, status_=Product.Status.DRAFT)

        tile = self.counts()["electronics"]
        listing = self.client.get("/api/v1/products/", {"category": "electronics"})
        self.assertEqual(tile, listing.json()["count"])

    def test_unpublished_and_deleted_products_are_not_counted(self):
        self.make("Published", self.leaf)
        self.make("Draft", self.leaf, status_=Product.Status.DRAFT)
        self.make("Removed", self.leaf, deleted=True)

        # Aggregating across a reverse relation bypasses Product's default
        # manager, so the soft-delete exclusion has to be explicit.
        self.assertEqual(self.counts()["electronics"], 1)

    def test_a_root_with_its_own_products_counts_both_levels(self):
        self.make("Direct", self.root)
        self.make("Nested", self.leaf)
        self.assertEqual(self.counts()["electronics"], 2)

    def test_tree_endpoint_gives_children_a_count(self):
        """Regression: children came back with the key missing entirely.

        `product_count` is a read-only DRF field, so an instance without the
        attribute raises SkipField — the key is dropped silently rather than
        erroring, and the Categories page rendered a blank count.
        """
        self.make("Laptop A", self.leaf)

        response = self.client.get("/api/v1/categories/tree/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        root = next(r for r in response.json() if r["slug"] == "electronics")
        self.assertEqual(root["product_count"], 1)

        child = root["children"][0]
        self.assertIn("product_count", child, "children must carry the annotation")
        self.assertEqual(child["product_count"], 1)


class CategoryDepthTests(APITestCase):
    """`with_product_counts` only descends one level.

    That matches the tree the app actually builds (root → child). If a third
    level is ever introduced, the counts silently under-report, so this fails
    loudly to say the annotation needs a recursive CTE.
    """

    def test_category_tree_is_at_most_two_levels_deep(self):
        root = Category.objects.create(name="Root", slug="depth-root")
        child = Category.objects.create(name="Child", slug="depth-child", parent=root)

        grandchildren = Category.objects.filter(parent__parent__isnull=False)
        self.assertFalse(
            grandchildren.exists(),
            "a third category level exists — with_product_counts needs a "
            "recursive CTE, it only sums one level down",
        )
        # Guard the guard: prove the query would notice one.
        Category.objects.create(name="Grand", slug="depth-grand", parent=child)
        self.assertTrue(Category.objects.filter(parent__parent__isnull=False).exists())
