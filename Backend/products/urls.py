from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    ProductImageViewSet,
    ProductVariantViewSet,
    ProductViewSet,
    ReviewViewSet,
)
from .views_ai import DraftListingView, ReviewSummaryView

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("product-images", ProductImageViewSet, basename="product-image")
router.register("product-variants", ProductVariantViewSet, basename="product-variant")
router.register("reviews", ReviewViewSet, basename="review")

app_name = "products"

urlpatterns = [
    path(
        "ai/draft-listing/",
        DraftListingView.as_view(),
        name="ai-draft-listing",
    ),
    path(
        "products/<slug:slug>/ai-summary/",
        ReviewSummaryView.as_view(),
        name="ai-review-summary",
    ),
    path("", include(router.urls)),
]
