"""Two audiences, two viewsets, two permission classes.

Kept in separate viewsets rather than one that branches on ``request.user.role``,
because a shared queryset that changes shape by role is how a seller ends up
reading another shop's mail.
"""

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import IsAdmin, IsSeller

from .models import AdminNotice, NoticeRecipient
from .serializers import (
    AdminNoticeSerializer,
    NoticeSendSerializer,
    SellerNoticeSerializer,
)
from .services import send_notice


@extend_schema_view(
    list=extend_schema(tags=["admin"], summary="Notices this admin has sent"),
)
class AdminNoticeViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = AdminNoticeSerializer

    def get_queryset(self):
        # Both counts in one query. Rendering "12 sent / 5 read" per row from
        # Python would be two extra queries per notice.
        return (
            AdminNotice.objects.select_related("author")
            .annotate(
                recipient_count=Count("recipients", distinct=True),
                read_count=Count(
                    "recipients",
                    filter=Q(recipients__read_at__isnull=False),
                    distinct=True,
                ),
            )
            .order_by("-created_at")
        )

    @extend_schema(
        tags=["admin"],
        summary="Send a notice to one seller, several, or all",
        request=NoticeSendSerializer,
        responses={201: AdminNoticeSerializer},
    )
    @action(detail=False, methods=["post"])
    def send(self, request):
        form = NoticeSendSerializer(data=request.data)
        form.is_valid(raise_exception=True)

        notice, count = send_notice(
            author=request.user,
            subject=form.validated_data["subject"],
            body=form.validated_data["body"],
            seller_ids=(
                None
                if form.validated_data.get("send_to_all")
                else form.validated_data["seller_ids"]
            ),
        )
        payload = self.get_queryset().get(pk=notice.pk)
        return Response(
            {**AdminNoticeSerializer(payload).data, "delivered_to": count},
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    list=extend_schema(tags=["seller"], summary="Notices sent to my shop"),
)
class SellerNoticeViewSet(viewsets.ReadOnlyModelViewSet):
    # IsSeller, not IsApprovedSeller: a pending seller must be able to read
    # "your application needs more documents", which is the whole point of
    # sending them a notice.
    permission_classes = [IsSeller]
    serializer_class = SellerNoticeSerializer

    def get_queryset(self):
        profile = getattr(self.request.user, "seller_profile", None)
        if profile is None:
            return NoticeRecipient.objects.none()
        return (
            NoticeRecipient.objects.filter(seller=profile)
            .select_related("notice")
            .order_by("-notice__created_at")
        )

    @extend_schema(tags=["seller"], summary="Unread notice count", responses={200: None})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @extend_schema(tags=["seller"], summary="Mark a notice read")
    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        recipient = self.get_object()
        # Idempotent: re-opening a notice must not move the timestamp, or
        # "when did they first see this" becomes unanswerable.
        if recipient.read_at is None:
            recipient.read_at = timezone.now()
            recipient.save(update_fields=["read_at"])
        return Response(SellerNoticeSerializer(recipient).data)

    @extend_schema(tags=["seller"], summary="Mark every notice read")
    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(read_at__isnull=True).update(
            read_at=timezone.now()
        )
        return Response({"marked": updated})
