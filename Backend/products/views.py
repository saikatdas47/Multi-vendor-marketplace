from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db import transaction
from django.db.models import Count, F, Q
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from accounts.models import AuditLog, SellerProfile
from accounts.services import log_action
from core.permissions import IsAdmin, IsApprovedSeller, IsSellerOwnerOrAdmin

from .filters import ProductFilter
from .models import (
    Category,
    Product,
    ProductImage,
    ProductVariant,
    Review,
    with_product_counts,
)
from .serializers import (
    CategorySerializer,
    CategoryTreeSerializer,
    ProductDetailSerializer,
    ProductImageSerializer,
    ProductListSerializer,
    ProductVariantSerializer,
    ReviewSerializer,
    StockAdjustSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=["catalog"], summary="List categories"),
    retrieve=extend_schema(tags=["catalog"], summary="Retrieve a category"),
)
class CategoryViewSet(viewsets.ModelViewSet):
    """Public read; admin-only write."""

    serializer_class = CategorySerializer
    lookup_field = "slug"
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["sort_order", "name"]

    def get_queryset(self):
        qs = with_product_counts(
            Category.objects.select_related("parent")
            # Meta.ordering is discarded once annotate() introduces a GROUP BY,
            # so it is restated here. Without it the paginated category list has
            # no stable order.
        ).order_by("sort_order", "name")
        if not (self.request.user.is_authenticated and self.request.user.is_admin_role):
            qs = qs.filter(is_active=True)
        if self.request.query_params.get("root_only") in ("1", "true"):
            qs = qs.filter(parent__isnull=True)
        return qs

    def get_permissions(self):
        if self.action in ("list", "retrieve", "tree"):
            return [AllowAny()]
        return [IsAdmin()]

    @extend_schema(tags=["catalog"], summary="Full category tree")
    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def tree(self, request):
        roots = self.get_queryset().filter(parent__isnull=True)
        return Response(CategoryTreeSerializer(roots, many=True, context={"request": request}).data)


@extend_schema_view(
    list=extend_schema(
        tags=["catalog"],
        summary="Browse / search products",
        parameters=[
            OpenApiParameter("q", str, description="Full-text search across name, description, SKU."),
            OpenApiParameter("category", str, description="Category slug (includes subcategories)."),
            OpenApiParameter("min_price", float),
            OpenApiParameter("max_price", float),
            OpenApiParameter("in_stock", bool),
            OpenApiParameter("ordering", str, description="price, -price, created_at, -avg_rating"),
        ],
    ),
    retrieve=extend_schema(tags=["catalog"], summary="Product detail"),
)
class ProductViewSet(viewsets.ModelViewSet):
    """Public catalogue + seller-scoped writes."""

    lookup_field = "slug"
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ProductFilter
    ordering_fields = ["price", "created_at", "avg_rating", "view_count", "name"]
    ordering = ["-created_at"]
    owner_field = "seller.user"

    def get_serializer_class(self):
        return ProductListSerializer if self.action == "list" else ProductDetailSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "reviews"):
            return [AllowAny()]
        if self.action in ("update", "partial_update", "destroy", "adjust_stock"):
            return [IsAuthenticated(), IsSellerOwnerOrAdmin()]
        return [IsApprovedSeller()]

    def get_queryset(self):
        qs = (
            Product.objects.select_related("seller", "category")
            .prefetch_related("images", "variants")
            .with_ratings()
        )
        user = self.request.user

        # Admins see everything. Sellers see the public catalogue plus their own
        # drafts (?mine=1 narrows to just their own). Everyone else sees only
        # published products.
        if user.is_authenticated and user.is_admin_role:
            pass
        elif user.is_authenticated and user.is_seller:
            if self.request.query_params.get("mine") in ("1", "true"):
                qs = qs.filter(seller__user=user)
            else:
                qs = qs.filter(
                    Q(status=Product.Status.PUBLISHED) | Q(seller__user=user)
                )
        else:
            qs = qs.published()

        q = self.request.query_params.get("q")
        if q:
            vector = (
                SearchVector("name", weight="A")
                + SearchVector("short_description", weight="B")
                + SearchVector("description", weight="C")
            )
            query = SearchQuery(q, search_type="websearch")
            qs = (
                qs.annotate(rank=SearchRank(vector, query))
                .filter(Q(rank__gt=0) | Q(sku__iexact=q))
                .order_by("-rank")
            )
        return qs

    def perform_create(self, serializer):
        seller = SellerProfile.objects.filter(user=self.request.user).first()
        if not seller or not seller.is_approved:
            raise PermissionDenied("Only approved sellers can create products.")
        product = serializer.save(seller=seller)
        log_action(self.request, AuditLog.Action.CREATE, product, {"name": product.name})

    def perform_update(self, serializer):
        changed = list(serializer.validated_data)
        product = serializer.save()
        log_action(
            self.request, AuditLog.Action.UPDATE, product, {"fields": changed}
        )

    def perform_destroy(self, instance):
        instance.delete()  # soft delete
        log_action(self.request, AuditLog.Action.DELETE, instance, {"soft": True})

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Product.objects.filter(pk=instance.pk).update(view_count=F("view_count") + 1)
        return Response(self.get_serializer(instance).data)

    @extend_schema(tags=["seller"], summary="Adjust stock atomically", request=StockAdjustSerializer)
    @action(detail=True, methods=["post"], url_path="adjust-stock")
    def adjust_stock(self, request, slug=None):
        product = self.get_object()
        serializer = StockAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        delta = serializer.validated_data["delta"]

        with transaction.atomic():
            locked = Product.objects.select_for_update().get(pk=product.pk)
            new_stock = locked.stock + delta
            if new_stock < 0:
                raise ValidationError(
                    {"delta": f"Only {locked.stock} unit(s) in stock."}
                )
            locked.stock = new_stock
            locked.save(update_fields=["stock", "updated_at"])

        log_action(
            request,
            AuditLog.Action.UPDATE,
            product,
            {"stock_delta": delta, "reason": serializer.validated_data.get("reason", "")},
        )
        return Response({"stock": new_stock, "is_low_stock": product.is_low_stock})

    @extend_schema(tags=["seller"], summary="My low-stock products")
    @action(detail=False, methods=["get"], url_path="low-stock", permission_classes=[IsApprovedSeller])
    def low_stock(self, request):
        qs = Product.objects.filter(
            seller__user=request.user, stock__lte=F("low_stock_threshold")
        ).select_related("category")
        page = self.paginate_queryset(qs)
        serializer = ProductListSerializer(page, many=True, context={"request": request})
        return self.get_paginated_response(serializer.data)

    @extend_schema(tags=["catalog"], summary="Reviews for a product")
    @action(detail=True, methods=["get"], permission_classes=[AllowAny])
    def reviews(self, request, slug=None):
        product = self.get_object()
        qs = product.reviews.filter(is_approved=True).select_related("user")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(ReviewSerializer(page, many=True).data)


@extend_schema_view(create=extend_schema(tags=["seller"], summary="Upload a product image"))
class ProductImageViewSet(viewsets.ModelViewSet):
    serializer_class = ProductImageSerializer
    permission_classes = [IsApprovedSeller]

    def get_queryset(self):
        return ProductImage.objects.filter(product__seller__user=self.request.user)

    def perform_create(self, serializer):
        product = self._owned_product()
        serializer.save(product=product)

    def _owned_product(self):
        product_id = self.request.data.get("product")
        product = Product.objects.filter(pk=product_id).first()
        if not product:
            raise ValidationError({"product": "Product not found."})
        if product.seller.user != self.request.user:
            raise PermissionDenied("You do not own this product.")
        return product


@extend_schema_view(create=extend_schema(tags=["seller"], summary="Add a product variant"))
class ProductVariantViewSet(viewsets.ModelViewSet):
    serializer_class = ProductVariantSerializer
    permission_classes = [IsApprovedSeller]

    def get_queryset(self):
        return ProductVariant.objects.filter(product__seller__user=self.request.user)

    def perform_create(self, serializer):
        product_id = self.request.data.get("product")
        product = Product.objects.filter(pk=product_id).first()
        if not product:
            raise ValidationError({"product": "Product not found."})
        if product.seller.user != self.request.user:
            raise PermissionDenied("You do not own this product.")
        serializer.save(product=product)


@extend_schema_view(
    create=extend_schema(tags=["reviews"], summary="Write a review"),
    list=extend_schema(tags=["reviews"], summary="My reviews"),
)
class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticated]
    owner_field = "user"

    def get_queryset(self):
        return Review.objects.filter(user=self.request.user).select_related("product")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.user != self.request.user:
            raise PermissionDenied("You can only edit your own review.")
        serializer.save()

    @extend_schema(tags=["reviews"], summary="Mark a review helpful")
    @action(detail=True, methods=["post"], url_path="helpful", permission_classes=[IsAuthenticated])
    def helpful(self, request, pk=None):
        Review.objects.filter(pk=pk).update(helpful_count=F("helpful_count") + 1)
        review = Review.objects.get(pk=pk)
        return Response({"helpful_count": review.helpful_count}, status=status.HTTP_200_OK)
