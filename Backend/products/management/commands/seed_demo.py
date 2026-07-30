"""Populate the database with a realistic demo catalogue.

    python manage.py seed_demo
    python manage.py seed_demo --no-images     # much faster
    python manage.py seed_demo --orders 40     # more order history
    python manage.py seed_demo --fresh         # wipe demo data first

Idempotent: everything is get_or_create'd on a natural key, so re-running adds
what's missing rather than duplicating. Product content lives in
`products/catalogue_data.py` so this file stays readable as logic.
"""

import random
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import Address, CustomerProfile, SellerProfile
from cart.models import WishlistItem
from orders.models import Order, OrderEvent, OrderItem, OrderStatus, PaymentStatus
from products.catalogue_data import PRODUCTS, REVIEW_TEMPLATES, SHOPS
from products.models import (
    Category,
    Product,
    ProductImage,
    ProductVariant,
    Review,
)
from products.placeholders import build_placeholder

User = get_user_model()

CATEGORY_TREE = {
    "Electronics": ["Smartphones", "Laptops", "Audio", "Cameras"],
    "Fashion": ["Men", "Women", "Footwear"],
    "Home & Living": ["Kitchen", "Furniture", "Decor"],
    "Books": ["Fiction", "Technology", "Business"],
}

CUSTOMERS = [
    ("Ayesha", "Rahman", "Dhaka", "1207"),
    ("Tanvir", "Hossain", "Chattogram", "4000"),
    ("Nusrat", "Jahan", "Sylhet", "3100"),
    ("Rifat", "Karim", "Khulna", "9000"),
    ("Maria", "Santos", "Dhaka", "1215"),
    ("Daniel", "Okafor", "Rajshahi", "6000"),
    ("Priya", "Sharma", "Dhaka", "1230"),
    ("Jonas", "Lindqvist", "Barishal", "8200"),
    ("Fatima", "Noor", "Dhaka", "1219"),
    ("Marcus", "Bell", "Chattogram", "4100"),
]


class Command(BaseCommand):
    help = "Seed a realistic demo catalogue with shops, products, reviews and orders."

    def add_arguments(self, parser):
        parser.add_argument("--orders", type=int, default=25)
        parser.add_argument(
            "--no-images", action="store_true",
            help="Skip image generation (much faster).",
        )
        parser.add_argument(
            "--fresh", action="store_true",
            help="Delete existing demo products and orders before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # Fixed seed so the demo looks identical on every machine — useful when
        # screenshots go in a README.
        random.seed(1337)
        self.no_images = options["no_images"]

        if options["fresh"]:
            self.stdout.write(self.style.WARNING("Removing existing demo data…"))
            Order.objects.all().delete()
            Product.all_objects.all().delete()

        admin = self.create_admin()
        categories = self.create_categories()
        shops = self.create_shops(admin)
        customers = self.create_customers()
        products = self.create_products(categories, shops)
        review_count = self.create_reviews(products, customers)
        self.create_wishlists(products, customers)
        order_count = self.create_orders(products, customers, options["orders"])

        self.report(shops, products, review_count, order_count)

    # ----------------------------------------------------------- fixtures --

    def create_admin(self):
        admin, created = User.objects.get_or_create(
            email="admin@commercex.test",
            defaults={
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
                "first_name": "Platform",
                "last_name": "Admin",
                "email_verified": True,
            },
        )
        if created:
            admin.set_password("Admin!2345")
            admin.save()
        return admin

    def create_categories(self):
        lookup = {}
        for order, (parent_name, children) in enumerate(CATEGORY_TREE.items()):
            # Drop the ampersand rather than expanding it: "Home & Living"
            # becomes "home-living", which is what the catalogue data and the
            # public URLs expect. Expanding to "and" silently breaks the join.
            parent_slug = slugify(parent_name.replace("&", ""))
            parent, _ = Category.objects.get_or_create(
                slug=parent_slug,
                defaults={
                    "name": parent_name,
                    "parent": None,
                    "sort_order": order,
                    "description": f"Everything in {parent_name.lower()}.",
                },
            )
            lookup[parent_slug] = parent
            for child_order, child in enumerate(children):
                child_slug = f"{parent_slug}-{slugify(child)}"
                child_obj, _ = Category.objects.get_or_create(
                    slug=child_slug,
                    defaults={
                        "name": child,
                        "parent": parent,
                        "sort_order": child_order,
                        "description": f"{child} in {parent_name}.",
                    },
                )
                lookup[child_slug] = child_obj
        return lookup

    def create_shops(self, admin):
        shops = {}
        for index, shop in enumerate(SHOPS, start=1):
            user, created = User.objects.get_or_create(
                email=f"seller{index}@commercex.test",
                defaults={
                    "role": User.Role.SELLER,
                    "first_name": shop["name"].split()[0],
                    "last_name": "Seller",
                    "phone": f"+8801{700000000 + index}",
                    "email_verified": True,
                },
            )
            if created:
                user.set_password("Seller!2345")
                user.save()

            profile, _ = SellerProfile.objects.get_or_create(
                user=user,
                defaults={
                    "shop_name": shop["name"],
                    "slug": shop["slug"],
                    "description": f"{shop['tagline']}\n\n{shop['description']}",
                    "business_email": f"hello@{shop['slug']}.test",
                    "business_phone": f"+8802{200000 + index}",
                    "tax_id": f"BD-VAT-{4000 + index}",
                    "status": SellerProfile.Status.APPROVED,
                    "approved_at": timezone.now(),
                    "approved_by": admin,
                    "commission_rate": Decimal(shop["commission"]),
                },
            )
            shops[shop["slug"]] = profile

        # One shop left pending so the admin approval queue isn't empty — the
        # workflow is only demonstrable if there's something waiting in it.
        pending_user, created = User.objects.get_or_create(
            email="pending-seller@commercex.test",
            defaults={
                "role": User.Role.SELLER,
                "first_name": "Aspiring",
                "last_name": "Seller",
            },
        )
        if created:
            pending_user.set_password("Seller!2345")
            pending_user.save()
        SellerProfile.objects.get_or_create(
            user=pending_user,
            defaults={
                "shop_name": "Ember Ceramics",
                "slug": "ember-ceramics",
                "description": "Hand-thrown stoneware. Awaiting approval.",
                "status": SellerProfile.Status.PENDING,
            },
        )
        return shops

    def create_customers(self):
        customers = []
        for index, (first, last, city, postcode) in enumerate(CUSTOMERS, start=1):
            user, created = User.objects.get_or_create(
                email=f"customer{index}@commercex.test",
                defaults={
                    "role": User.Role.CUSTOMER,
                    "first_name": first,
                    "last_name": last,
                    "phone": f"+8801{800000000 + index}",
                    "email_verified": index % 4 != 0,  # a few unverified on purpose
                },
            )
            if created:
                user.set_password("Customer!2345")
                user.save()
            CustomerProfile.objects.get_or_create(
                user=user,
                defaults={"newsletter_opt_in": index % 3 == 0},
            )
            Address.objects.get_or_create(
                user=user,
                label="Home",
                defaults={
                    "full_name": f"{first} {last}",
                    "phone": f"+8801{800000000 + index}",
                    "line1": f"House {index * 7}, Road {index * 3}",
                    "line2": f"Flat {chr(64 + index)}{index}",
                    "city": city,
                    "state": city,
                    "postal_code": postcode,
                    "is_default": True,
                },
            )
            # A second address for a few customers, so the checkout picker has
            # something to actually pick between.
            if index % 3 == 0:
                Address.objects.get_or_create(
                    user=user,
                    label="Office",
                    defaults={
                        "full_name": f"{first} {last}",
                        "phone": f"+8801{800000000 + index}",
                        "line1": f"Level {index}, Tower {index % 5 + 1}",
                        "city": city,
                        "postal_code": postcode,
                        "is_default": False,
                    },
                )
            customers.append(user)
        return customers

    # ----------------------------------------------------------- catalogue --

    def create_products(self, categories, shops):
        created = []
        total = len(PRODUCTS)
        self.stdout.write(f"Creating {total} products…")

        for index, row in enumerate(PRODUCTS, start=1):
            (category_slug, shop_slug, name, price, compare_at, stock,
             short_description, specs, variants, featured) = row

            category = categories.get(category_slug)
            seller = shops.get(shop_slug)
            if not category or not seller:
                continue

            sku = f"{shop_slug[:3].upper()}-{slugify(name)[:16].upper()}"
            description = self.build_description(name, short_description, specs, seller)

            product, made = Product.objects.get_or_create(
                sku=sku,
                defaults={
                    "seller": seller,
                    "category": category,
                    "name": name,
                    "slug": slugify(name)[:230],
                    "short_description": short_description,
                    "description": description,
                    "price": Decimal(price),
                    "compare_at_price": Decimal(compare_at) if compare_at else None,
                    "cost_price": (Decimal(price) * Decimal("0.62")).quantize(Decimal("0.01")),
                    "stock": stock,
                    "low_stock_threshold": 5,
                    "weight_grams": random.choice([250, 400, 800, 1200, 2400, 5000]),
                    "status": Product.Status.PUBLISHED,
                    "is_featured": featured,
                    "view_count": random.randint(12, 1400),
                },
            )
            if not made:
                created.append(product)
                continue

            for group, value, delta, variant_stock in variants:
                ProductVariant.objects.get_or_create(
                    product=product,
                    name=group,
                    value=value,
                    defaults={
                        "sku": f"{sku}-{slugify(group)[:4]}-{slugify(value)[:6]}".upper(),
                        "price_delta": Decimal(delta),
                        "stock": variant_stock,
                    },
                )

            if not self.no_images:
                self.attach_images(product, seller, category)

            created.append(product)
            if index % 10 == 0 or index == total:
                self.stdout.write(f"  {index}/{total}…")

        # A couple of drafts and an archived item, so seller filters have
        # something to filter and the public catalogue can be shown to exclude
        # them.
        first_shop = next(iter(shops.values()))
        for label, status_ in (("Unreleased Prototype", Product.Status.DRAFT),
                               ("Discontinued Adapter", Product.Status.ARCHIVED)):
            Product.objects.get_or_create(
                sku=f"DEMO-{slugify(label)[:12].upper()}",
                defaults={
                    "seller": first_shop,
                    "category": categories["electronics-audio"],
                    "name": label,
                    "slug": slugify(label),
                    "short_description": f"{label} — not visible to shoppers.",
                    "description": f"Seeded {status_} product so seller filters have data.",
                    "price": Decimal("49.00"),
                    "stock": 3,
                    "status": status_,
                },
            )
        return created

    def build_description(self, name, short_description, specs, seller):
        """Two paragraphs plus a spec list — what a real listing looks like."""
        spec_block = "\n".join(f"• {spec}" for spec in specs)
        return (
            f"{short_description}\n\n"
            f"{name} is stocked by {seller.shop_name}. Every listing here "
            f"publishes measured figures rather than marketing ones, so what you "
            f"read below is what you get.\n\n"
            f"Specifications\n{spec_block}\n\n"
            f"Shipped free. Cancel any time before it's packed."
        )

    def attach_images(self, product, seller, category):
        for position in range(random.choice([1, 2, 2, 3])):
            content = build_placeholder(
                product.name,
                subtitle=seller.shop_name,
                category=category.name,
                variant=position,
            )
            if content is None:
                return
            image = ProductImage(
                product=product,
                alt_text=f"{product.name} — view {position + 1}",
                is_primary=position == 0,
                sort_order=position,
            )
            image.image.save(f"{product.sku.lower()}-{position}.jpg", content, save=True)

    # ------------------------------------------------------------- social --

    def create_reviews(self, products, customers):
        count = 0
        for product in products:
            # Weighted so the histogram on the product page looks like a real
            # distribution rather than all fives.
            for reviewer in random.sample(customers, k=random.randint(0, 6)):
                rating = random.choices([5, 4, 3, 2, 1], weights=[46, 28, 14, 8, 4])[0]
                title, comment = random.choice(REVIEW_TEMPLATES[rating])
                _, made = Review.objects.get_or_create(
                    product=product,
                    user=reviewer,
                    defaults={
                        "rating": rating,
                        "title": title,
                        "comment": comment,
                        "is_verified_purchase": random.random() < 0.72,
                        "helpful_count": random.randint(0, 34),
                    },
                )
                count += int(made)
        return count

    def create_wishlists(self, products, customers):
        for customer in customers:
            for product in random.sample(products, k=random.randint(0, 5)):
                WishlistItem.objects.get_or_create(user=customer, product=product)

    def create_orders(self, products, customers, target):
        """Order history spread across statuses, so every screen has data."""
        buyable = [p for p in products if p.stock > 0 and p.status == Product.Status.PUBLISHED]
        if not buyable:
            return 0

        # Weighted towards settled orders, with a few live ones needing action.
        status_plan = (
            [OrderStatus.DELIVERED] * 8
            + [OrderStatus.COMPLETED] * 5
            + [OrderStatus.SHIPPED] * 3
            + [OrderStatus.PACKED] * 2
            + [OrderStatus.CONFIRMED] * 3
            + [OrderStatus.PENDING] * 3
            + [OrderStatus.CANCELLED] * 2
        )

        created = 0
        for index in range(target):
            customer = random.choice(customers)
            address = customer.addresses.filter(is_default=True).first()
            if not address:
                continue

            status_ = status_plan[index % len(status_plan)]
            days_ago = random.randint(1, 75)
            placed = timezone.now() - timezone.timedelta(days=days_ago)

            order = Order.objects.create(
                customer=customer,
                customer_email=customer.email,
                status=status_,
                payment_status=(
                    PaymentStatus.PAID
                    if status_ in {OrderStatus.DELIVERED, OrderStatus.COMPLETED,
                                   OrderStatus.SHIPPED}
                    else PaymentStatus.UNPAID
                ),
                payment_method=random.choice(["cod", "card"]),
                payment_reference=f"TXN-{random.randint(10**7, 10**8 - 1)}",
                ship_to_name=address.full_name,
                ship_to_phone=address.phone,
                ship_to_line1=address.line1,
                ship_to_line2=address.line2,
                ship_to_city=address.city,
                ship_to_state=address.state,
                ship_to_postal_code=address.postal_code,
                ship_to_country=address.country,
                customer_note=random.choice(
                    ["", "", "", "Please leave with the concierge.",
                     "Gift — no invoice in the box please.",
                     "Call before delivery, the gate is locked."]
                ),
                placed_at=placed,
                delivered_at=(
                    placed + timezone.timedelta(days=random.randint(2, 6))
                    if status_ in {OrderStatus.DELIVERED, OrderStatus.COMPLETED}
                    else None
                ),
            )

            # Multi-seller orders on purpose, so per-seller fulfilment is visible.
            for product in random.sample(buyable, k=random.randint(1, 3)):
                quantity = random.randint(1, 2)
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    seller=product.seller,
                    product_name=product.name,
                    product_sku=product.sku,
                    product_slug=product.slug,
                    seller_name=product.seller.shop_name if product.seller else "Unknown",
                    unit_price=product.price,
                    quantity=quantity,
                    status=status_,
                    tracking_number=(
                        f"CX{random.randint(10**9, 10**10 - 1)}"
                        if status_ in {OrderStatus.SHIPPED, OrderStatus.DELIVERED,
                                       OrderStatus.COMPLETED}
                        else ""
                    ),
                    stock_released=status_ == OrderStatus.CANCELLED,
                )

            order.recalculate_totals()

            # A plausible event trail, so the tracking timeline isn't empty.
            timeline = [OrderStatus.PENDING]
            for step in (OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.SHIPPED,
                         OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED,
                         OrderStatus.COMPLETED):
                if timeline[-1] == status_:
                    break
                timeline.append(step)
            if status_ == OrderStatus.CANCELLED:
                timeline = [OrderStatus.PENDING, OrderStatus.CANCELLED]

            for offset, step in enumerate(timeline):
                OrderEvent.objects.create(
                    order=order,
                    status=step,
                    note={
                        OrderStatus.PENDING: "Order placed.",
                        OrderStatus.CONFIRMED: "Seller confirmed the order.",
                        OrderStatus.PACKED: "Packed and awaiting collection.",
                        OrderStatus.SHIPPED: "Handed to the courier.",
                        OrderStatus.OUT_FOR_DELIVERY: "Out for delivery today.",
                        OrderStatus.DELIVERED: "Delivered.",
                        OrderStatus.COMPLETED: "Order completed.",
                        OrderStatus.CANCELLED: "Cancelled by customer.",
                    }.get(step, ""),
                )
            created += 1
        return created

    # -------------------------------------------------------------- report --

    def report(self, shops, products, review_count, order_count):
        if not self.no_images and build_placeholder("probe") is None:
            self.stdout.write(
                self.style.WARNING(
                    "Pillow is not installed, so no images were generated. "
                    "Run: pip install Pillow"
                )
            )

        published = sum(1 for p in products if p.status == Product.Status.PUBLISHED)
        self.stdout.write(
            self.style.SUCCESS(
                f"""
Seeded successfully.

  Shops          {len(shops)} approved + 1 pending approval
  Categories     {Category.objects.count()}
  Products       {published} published ({Product.all_objects.count()} total incl. draft/archived)
  Variants       {ProductVariant.objects.count()}
  Images         {ProductImage.objects.count()}
  Reviews        {review_count}
  Wishlist items {WishlistItem.objects.count()}
  Orders         {order_count} across every status
  Customers      {len(CUSTOMERS)}

Logins (email, not username)
  admin      admin@commercex.test             Admin!2345
  seller     seller1@commercex.test           Seller!2345   (VoltEdge Electronics)
  seller     seller2@commercex.test           Seller!2345   (North Loom)
  pending    pending-seller@commercex.test    Seller!2345   (awaiting approval)
  customer   customer1@commercex.test         Customer!2345
"""
            )
        )
