"""Public storefront: the shop directory and one shop's page.

Products for a shop are not a separate endpoint — ``/products/?seller=<slug>``
already filters on ``seller__slug`` and comes with the catalogue's pagination,
ordering and price filters for free. Adding ``/shops/<slug>/products/`` would
mean maintaining a second, weaker product list.
"""

from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import filters, generics
from rest_framework.permissions import AllowAny

from accounts.models import SellerProfile
from products.models import Product

from .serializers import ShopDetailSerializer, ShopListSerializer


def annotate_products(queryset):
    """Annotate how many products are actually buyable.

    Filtered to published, non-deleted products so a shop with 40 drafts does not
    advertise 40 items. ``distinct=True`` because the annotation would otherwise
    multiply across the join.
    """
    return queryset.select_related("user").annotate(
        product_count=Count(
            "products",
            filter=Q(
                products__status=Product.Status.PUBLISHED,
                products__deleted_at__isnull=True,
            ),
            distinct=True,
        )
    ).order_by("shop_name")


def approved_shops():
    return annotate_products(
        SellerProfile.objects.filter(status=SellerProfile.Status.APPROVED)
    )


@extend_schema_view(get=extend_schema(tags=["public"], summary="Shop directory"))
class ShopListView(generics.ListAPIView):
    serializer_class = ShopListSerializer
    permission_classes = [AllowAny]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["shop_name", "description"]
    ordering_fields = ["created_at", "shop_name", "product_count"]
    ordering = ["-product_count", "shop_name"]

    def get_queryset(self):
        return approved_shops()


@extend_schema_view(get=extend_schema(tags=["public"], summary="Shop storefront"))
class ShopDetailView(generics.RetrieveAPIView):
    serializer_class = ShopDetailSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        # Approved shops are public. A pending or rejected shop 404s rather than
        # 403s on purpose: whether an application exists is not public
        # information.
        #
        # The one exception is the owner. A seller previewing their own shop
        # before approval is the whole point of the preview screen, so they
        # resolve their own slug regardless of status. This widens the queryset
        # for exactly one row and only for the user it belongs to.
        base = SellerProfile.objects.filter(status=SellerProfile.Status.APPROVED)
        user = self.request.user
        if user.is_authenticated and getattr(user, "is_seller", False):
            base = SellerProfile.objects.filter(
                Q(status=SellerProfile.Status.APPROVED) | Q(user=user)
            )
        return annotate_products(base)
