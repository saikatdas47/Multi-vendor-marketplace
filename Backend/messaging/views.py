"""Admin inbox across all shops; seller inbox for its own thread only.

The seller endpoints are singular (`/seller/thread/`) rather than a list, because
a shop has exactly one thread with the platform. Exposing it as a collection
would invite a `?seller=` filter that must never work.
"""

from django.db.models import Count, Prefetch
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import SellerProfile
from core.permissions import IsAdmin, IsSeller

from .models import Conversation, Message
from .serializers import (
    PostMessageSerializer,
    ThreadListSerializer,
    ThreadSerializer,
)
from .services import get_thread, mark_read, post_message


def with_preview(queryset):
    """Attach the newest message per thread without an N+1.

    A `Prefetch` with a sliced queryset is the cheap way to do "latest child per
    parent" in Django without a window function.
    """
    return (
        queryset.select_related("seller", "seller__user")
        .prefetch_related(
            Prefetch(
                "messages",
                queryset=Message.objects.order_by("-created_at")[:1],
                to_attr="latest_message",
            )
        )
        .annotate(message_count=Count("messages"))
        # annotate() adds a GROUP BY, and Django drops Meta.ordering for grouped
        # queries ("A default ordering doesn't affect GROUP BY queries" —
        # django/db/models/query.py). Without this the paginator has no stable
        # order, so page 2 can repeat or skip threads from page 1.
        .order_by("-last_message_at")
    )


@extend_schema_view(
    list=extend_schema(tags=["admin"], summary="Seller conversations"),
    retrieve=extend_schema(tags=["admin"], summary="One seller's thread"),
)
class AdminThreadViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = Conversation.objects.all()
        if self.action == "list":
            qs = with_preview(qs)
            if self.request.query_params.get("unread") == "1":
                qs = qs.filter(admin_unread__gt=0)
            return qs
        return qs.select_related("seller", "seller__user").prefetch_related("messages")

    def get_serializer_class(self):
        return ThreadListSerializer if self.action == "list" else ThreadSerializer

    def retrieve(self, request, *args, **kwargs):
        conversation = self.get_object()
        # Opening a thread is reading it.
        mark_read(conversation, side=Message.Side.ADMIN)
        return Response(ThreadSerializer(conversation).data)

    @extend_schema(tags=["admin"], summary="Unread thread count")
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response(
            {"unread": Conversation.objects.filter(admin_unread__gt=0).count()}
        )


@extend_schema(tags=["admin"], summary="Message one seller")
class AdminSendMessageView(APIView):
    """Addressed by seller id, not conversation id.

    The admin starts from a shop ("message this seller"), and may be the first to
    write — so requiring an existing conversation id would mean a two-step dance
    to create one. This creates the thread on demand.
    """

    permission_classes = [IsAdmin]
    serializer_class = PostMessageSerializer

    def post(self, request, seller_id):
        seller = get_object_or_404(SellerProfile, pk=seller_id)
        form = PostMessageSerializer(data=request.data)
        form.is_valid(raise_exception=True)

        conversation, _ = post_message(
            seller=seller,
            sender=request.user,
            side=Message.Side.ADMIN,
            body=form.validated_data["body"],
        )
        conversation = (
            Conversation.objects.select_related("seller", "seller__user")
            .prefetch_related("messages")
            .get(pk=conversation.pk)
        )
        return Response(
            ThreadSerializer(conversation).data, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["seller"], summary="My thread with the platform")
class SellerThreadView(APIView):
    # IsSeller, not IsApprovedSeller: a pending or suspended shop needs this more
    # than an approved one does — it is how they ask what went wrong.
    permission_classes = [IsSeller]
    serializer_class = PostMessageSerializer

    def _seller(self, request):
        return get_object_or_404(SellerProfile, user=request.user)

    def get(self, request):
        conversation = get_thread(self._seller(request))
        mark_read(conversation, side=Message.Side.SELLER)
        conversation = (
            Conversation.objects.select_related("seller", "seller__user")
            .prefetch_related("messages")
            .get(pk=conversation.pk)
        )
        return Response(ThreadSerializer(conversation).data)

    def post(self, request):
        form = PostMessageSerializer(data=request.data)
        form.is_valid(raise_exception=True)

        conversation, _ = post_message(
            seller=self._seller(request),
            sender=request.user,
            side=Message.Side.SELLER,
            body=form.validated_data["body"],
        )
        conversation = (
            Conversation.objects.select_related("seller", "seller__user")
            .prefetch_related("messages")
            .get(pk=conversation.pk)
        )
        return Response(
            ThreadSerializer(conversation).data, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["seller"], summary="My unread message count")
class SellerUnreadView(APIView):
    permission_classes = [IsSeller]

    def get(self, request):
        profile = getattr(request.user, "seller_profile", None)
        conversation = (
            Conversation.objects.filter(seller=profile).first() if profile else None
        )
        return Response({"unread": conversation.seller_unread if conversation else 0})
