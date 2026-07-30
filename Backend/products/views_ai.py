"""AI-assisted endpoints.

The Groq key lives only in server settings; the browser never sees it, and
every call is throttled per user because each one costs money.
"""

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.ai import AIUnavailable, draft_product_listing, summarise_reviews
from core.permissions import IsApprovedSeller

from .models import Category, Product


class AIThrottle(ScopedRateThrottle):
    scope = "ai"


class DraftListingSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    category = serializers.UUIDField(required=False, allow_null=True)
    brand = serializers.CharField(required=False, allow_blank=True, max_length=80)
    features = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=400,
        help_text="Newline- or comma-separated specs. e.g. RGB, 16000 DPI, USB-C",
    )
    short_description = serializers.CharField(
        required=False, allow_blank=True, max_length=300
    )
    tone = serializers.ChoiceField(
        choices=["professional", "friendly", "technical", "playful"],
        default="professional",
    )


class ListingResultSerializer(serializers.Serializer):
    """Documents the response shape for the schema."""

    seo_title = serializers.CharField()
    description = serializers.CharField()
    bullets = serializers.ListField(child=serializers.CharField())
    meta_description = serializers.CharField()
    notice = serializers.CharField()


@extend_schema(
    tags=["ai"],
    summary="Draft a full product listing",
    description=(
        "Generates an SEO title, description, benefit bullets and a meta "
        "description from the facts the seller supplies.\n\n"
        "All four are produced in a **single** model call — the product facts "
        "are sent once instead of four times, which is the main cost saving.\n\n"
        "Nothing is saved: the seller reviews and applies each field. Throttled "
        "to the `ai` rate."
    ),
    request=DraftListingSerializer,
    responses={200: ListingResultSerializer},
)
class DraftListingView(APIView):
    permission_classes = [IsApprovedSeller]
    throttle_classes = [AIThrottle]

    def post(self, request):
        serializer = DraftListingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        category_name = "General"
        if data.get("category"):
            category = Category.objects.filter(pk=data["category"]).first()
            if category:
                category_name = category.full_path

        try:
            listing = draft_product_listing(
                name=data["name"],
                category=category_name,
                brand=data.get("brand", ""),
                features=data.get("features", ""),
                short_description=data.get("short_description", ""),
                tone=data["tone"],
            )
        except AIUnavailable as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        listing["notice"] = (
            "AI-generated draft — check every claim against the real product "
            "before publishing."
        )
        return Response(listing)


@extend_schema(
    tags=["ai"],
    summary="Summarise a product's reviews",
    description=(
        "Cached for 6 hours per product, so repeat visitors cost nothing. "
        "Returns 204 when there aren't enough written reviews yet."
    ),
)
class ReviewSummaryView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug=None):
        if not settings.AI_ENABLED:
            return Response(status=status.HTTP_204_NO_CONTENT)

        product = get_object_or_404(
            Product.objects.filter(status=Product.Status.PUBLISHED), slug=slug
        )
        reviews = list(
            product.reviews.filter(is_approved=True)
            .exclude(comment="")
            .order_by("-helpful_count", "-created_at")
            .values_list("rating", "comment")[:25]
        )

        try:
            summary = summarise_reviews(product_name=product.name, reviews=reviews)
        except AIUnavailable:
            # Not an error the shopper needs to see - just render nothing.
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({"summary": summary, "based_on": len(reviews)})
