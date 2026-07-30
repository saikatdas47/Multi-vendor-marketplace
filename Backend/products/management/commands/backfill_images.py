"""Gives images to products that don't have any.

Needed because `seed_demo` skips products that already exist, so anything
created before image generation was added stays imageless. Running this is
faster and safer than dropping the catalogue and re-seeding.

    python manage.py backfill_images
    python manage.py backfill_images --replace    # regenerate everything
    python manage.py backfill_images --per 3      # gallery of 3 per product
"""

import random

from django.core.management.base import BaseCommand
from django.db import transaction

from products.models import Product, ProductImage
from products.placeholders import build_placeholder


class Command(BaseCommand):
    help = "Generate placeholder images for products that are missing them."

    def add_arguments(self, parser):
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Delete existing images and regenerate.",
        )
        parser.add_argument(
            "--per", type=int, default=0,
            help="Images per product. 0 = random 1-3.",
        )
        parser.add_argument(
            "--limit", type=int, default=0, help="Only process the first N products."
        )

    def handle(self, *args, **options):
        if build_placeholder("probe") is None:
            self.stderr.write(
                self.style.ERROR("Pillow is not installed. Run: pip install Pillow")
            )
            return

        random.seed(42)  # deterministic gallery sizes across runs

        products = Product.all_objects.select_related("category", "seller").order_by(
            "created_at"
        )
        if not options["replace"]:
            products = products.filter(images__isnull=True)
        if options["limit"]:
            products = products[: options["limit"]]

        products = list(products)
        if not products:
            self.stdout.write(
                self.style.SUCCESS("Every product already has an image — nothing to do.")
            )
            return

        self.stdout.write(f"Generating images for {len(products)} product(s)…")

        created = 0
        for index, product in enumerate(products, start=1):
            with transaction.atomic():
                if options["replace"]:
                    product.images.all().delete()

                count = options["per"] or random.choice([1, 1, 2, 3])
                for position in range(count):
                    content = build_placeholder(
                        product.name,
                        subtitle=product.seller.shop_name if product.seller else "",
                        category=product.category.name if product.category else "",
                        variant=position,
                    )
                    if content is None:
                        break

                    image = ProductImage(
                        product=product,
                        alt_text=product.name,
                        is_primary=position == 0,
                        sort_order=position,
                    )
                    image.image.save(
                        f"{product.sku.lower().replace('/', '-')}-{position}.jpg",
                        content,
                        save=True,
                    )
                    created += 1

            # Progress matters here: generating a few hundred images is slow
            # enough that silence looks like a hang.
            if index % 10 == 0 or index == len(products):
                self.stdout.write(f"  {index}/{len(products)} products…")

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created {created} image(s) across {len(products)} product(s)."
            )
        )
