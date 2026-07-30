import logging

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import filters, generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from core.permissions import IsAdmin, IsCustomer, IsSeller

from .emails import send_seller_approved_email, send_verification_email
from .models import Address, AuditLog, CustomerProfile, SellerProfile
from .tokens import EmailToken
from .serializers import (
    AddressSerializer,
    AuditLogSerializer,
    ChangePasswordSerializer,
    CommerceXTokenObtainPairSerializer,
    CustomerProfileSerializer,
    RegisterSerializer,
    SellerApprovalSerializer,
    SellerProfileSerializer,
    UserSerializer,
)
from .services import log_action

User = get_user_model()
logger = logging.getLogger(__name__)


@extend_schema(tags=["auth"], summary="Register a customer or seller account")
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_action(request, AuditLog.Action.CREATE, user, {"role": user.role})

        # Strictly best-effort. The account already exists at this point, so
        # anything that goes wrong while issuing or sending the verification
        # email must not turn a successful signup into a 500 - that would leave
        # the user with an account they believe was never created.
        try:
            raw, _ = EmailToken.issue(user, EmailToken.Purpose.VERIFY_EMAIL)
            send_verification_email(user, raw)
        except Exception:
            logger.exception("Could not send verification email to %s", user.email)

        refresh = RefreshToken.for_user(user)
        refresh["role"] = user.role
        refresh["email"] = user.email
        return Response(
            {
                "user": UserSerializer(user).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["auth"], summary="Obtain JWT access + refresh tokens")
class LoginView(TokenObtainPairView):
    serializer_class = CommerceXTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            user = User.objects.filter(
                email__iexact=request.data.get("email", "")
            ).first()
            if user:
                log_action(request, AuditLog.Action.LOGIN, user)
        return response


@extend_schema(
    tags=["auth"],
    summary="Blacklist a refresh token (logout)",
    request=None,
    responses={205: None},
)
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("refresh")
        if not token:
            return Response(
                {"detail": "refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(token).blacklist()
        except Exception:
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


@extend_schema(tags=["auth"], summary="Retrieve or update the signed-in user")
class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


@extend_schema(tags=["auth"], summary="Change password")
class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(request, AuditLog.Action.UPDATE, request.user, {"password": "changed"})
        return Response({"detail": "Password updated."})


@extend_schema(tags=["profile"])
class CustomerProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = CustomerProfileSerializer
    # IsCustomer, not IsAuthenticated: get_object() below is a get_or_create, so
    # a seller or admin merely *reading* this endpoint used to create a customer
    # profile row for themselves. An access check that also prevents junk data.
    permission_classes = [IsCustomer]

    def get_object(self):
        profile, _ = CustomerProfile.objects.get_or_create(user=self.request.user)
        return profile


@extend_schema(tags=["profile"])
class SellerProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = SellerProfileSerializer
    # IsSeller rather than IsApprovedSeller: a pending seller has to be able to
    # read and edit their own shop while they wait for approval.
    permission_classes = [IsSeller]

    def get_object(self):
        return generics.get_object_or_404(SellerProfile, user=self.request.user)


@extend_schema_view(
    list=extend_schema(tags=["profile"], summary="List my saved addresses"),
    create=extend_schema(tags=["profile"], summary="Add an address"),
)
class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    # Addresses exist to be shipped to, and checkout is customer-only. A seller's
    # business contact details live on SellerProfile instead.
    permission_classes = [IsCustomer]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# The public shop directory moved to the `shops` app, which owns the whole
# storefront surface. This app keeps identity: auth, profiles, addresses.


# ----------------------------- admin -----------------------------------


@extend_schema_view(list=extend_schema(tags=["admin"], summary="Manage users"))
class AdminUserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    queryset = User.objects.all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["email", "first_name", "last_name", "phone"]
    ordering_fields = ["created_at", "email"]

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        active = self.request.query_params.get("is_active")
        if active is not None:
            qs = qs.filter(is_active=active.lower() in ("1", "true", "yes"))
        return qs

    @extend_schema(tags=["admin"], summary="Activate / deactivate a user")
    @action(detail=True, methods=["post"])
    def toggle_active(self, request, pk=None):
        user = self.get_object()
        user.is_active = not user.is_active
        user.save(update_fields=["is_active"])
        log_action(request, AuditLog.Action.UPDATE, user, {"is_active": user.is_active})
        return Response(UserSerializer(user).data)


@extend_schema_view(list=extend_schema(tags=["admin"], summary="Review seller applications"))
class AdminSellerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SellerProfileSerializer
    permission_classes = [IsAdmin]
    queryset = SellerProfile.objects.select_related("user").all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["shop_name", "user__email", "business_email"]
    ordering_fields = ["created_at", "shop_name", "status"]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        return qs.filter(status=status_param) if status_param else qs

    @extend_schema(
        tags=["admin"],
        summary="Approve, reject or suspend a seller",
        request=SellerApprovalSerializer,
    )
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        seller = self.get_object()
        serializer = SellerApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        seller.status = new_status
        seller.rejection_reason = serializer.validated_data.get("rejection_reason", "")
        if new_status == SellerProfile.Status.APPROVED:
            seller.approved_at = timezone.now()
            seller.approved_by = request.user
        seller.save()

        if new_status == SellerProfile.Status.APPROVED:
            send_seller_approved_email(seller.user, seller.shop_name)

        log_action(
            request,
            AuditLog.Action.APPROVE
            if new_status == SellerProfile.Status.APPROVED
            else AuditLog.Action.REJECT,
            seller,
            {"status": new_status},
        )
        return Response(SellerProfileSerializer(seller).data)


@extend_schema_view(list=extend_schema(tags=["admin"], summary="Audit trail"))
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]
    queryset = AuditLog.objects.select_related("actor").all()

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(actor__email__icontains=q)
                | Q(target_model__icontains=q)
                | Q(target_id__icontains=q)
            )
        action_param = self.request.query_params.get("action")
        if action_param:
            qs = qs.filter(action=action_param)
        return qs


@extend_schema(tags=["admin"], summary="Admin dashboard counters")
class AdminDashboardView(APIView):
    """Everything the admin landing page needs, in one request.

    Assembled here rather than left to the client because the alternative is six
    list calls whose counts the page then has to derive — and a dashboard that
    fires six requests on mount feels slow no matter how fast each one is.
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        from billing.models import Invoice
        from messaging.models import Conversation
        from products.models import Product

        shops = SellerProfile.objects.aggregate(
            total=Count("id"),
            pending=Count("id", filter=Q(status=SellerProfile.Status.PENDING)),
            approved=Count("id", filter=Q(status=SellerProfile.Status.APPROVED)),
            rejected=Count("id", filter=Q(status=SellerProfile.Status.REJECTED)),
            suspended=Count("id", filter=Q(status=SellerProfile.Status.SUSPENDED)),
        )

        fees = Invoice.objects.aggregate(
            due=Sum("amount", filter=Q(status=Invoice.Status.DUE)),
            submitted=Sum("amount", filter=Q(status=Invoice.Status.SUBMITTED)),
            collected=Sum("amount", filter=Q(status=Invoice.Status.PAID)),
            awaiting_confirmation=Count(
                "id", filter=Q(status=Invoice.Status.SUBMITTED)
            ),
            overdue=Count(
                "id",
                filter=Q(
                    status=Invoice.Status.DUE, due_date__lt=timezone.localdate()
                ),
            ),
        )
        fees = {k: (v or 0) for k, v in fees.items()}

        return Response(
            {
                "shops": shops,
                "products": Product.objects.count(),
                "fees": {**fees, "outstanding": fees["due"] + fees["submitted"]},
                "unread_conversations": Conversation.objects.filter(
                    admin_unread__gt=0
                ).count(),
            }
        )
