"""Email verification and password reset.

Every endpoint here returns the same response whether or not the email exists,
so the API can't be used to enumerate registered accounts.
"""

from django.contrib.auth import get_user_model
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from .emails import send_password_reset_email, send_verification_email
from .models import AuditLog
from .serializers import (
    EmailOnlySerializer,
    ResetPasswordSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)
from .services import log_action
from .tokens import EmailToken

User = get_user_model()

GENERIC_SENT = {
    "detail": "If an account exists for that address, we've sent an email. "
    "Check your inbox and spam folder."
}


class EmailThrottle(ScopedRateThrottle):
    scope = "email"


@extend_schema(
    tags=["auth"],
    summary="Send a verification email to the signed-in user",
    request=None,
)
class SendVerificationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [EmailThrottle]

    def post(self, request):
        user = request.user
        if user.email_verified:
            return Response({"detail": "Your email is already verified."})

        raw, _ = EmailToken.issue(user, EmailToken.Purpose.VERIFY_EMAIL)
        sent = send_verification_email(user, raw)
        return Response(
            {
                "detail": "Verification email sent."
                if sent
                else "We couldn't send the email just now. Please try again shortly.",
                "sent": sent,
            },
            status=status.HTTP_200_OK if sent else status.HTTP_503_SERVICE_UNAVAILABLE,
        )


@extend_schema(
    tags=["auth"],
    summary="Confirm an email address with a token",
    request=VerifyEmailSerializer,
)
class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = EmailToken.resolve(
            serializer.validated_data["token"], EmailToken.Purpose.VERIFY_EMAIL
        )
        if not token:
            return Response(
                {"detail": "That link is invalid or has expired. Request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            token.consume()
            user = token.user
            if not user.email_verified:
                user.email_verified = True
                user.save(update_fields=["email_verified"])

        log_action(request, AuditLog.Action.UPDATE, user, {"email_verified": True})
        return Response({"detail": "Email verified.", "user": UserSerializer(user).data})


@extend_schema(
    tags=["auth"],
    summary="Request a password reset link",
    request=EmailOnlySerializer,
)
class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [EmailThrottle]

    def post(self, request):
        serializer = EmailOnlySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"], is_active=True
        ).first()
        if user:
            raw, _ = EmailToken.issue(user, EmailToken.Purpose.RESET_PASSWORD)
            send_password_reset_email(user, raw)

        # Identical response either way - no account enumeration.
        return Response(GENERIC_SENT)


@extend_schema(
    tags=["auth"],
    summary="Set a new password using a reset token",
    request=ResetPasswordSerializer,
)
class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = EmailToken.resolve(
            serializer.validated_data["token"], EmailToken.Purpose.RESET_PASSWORD
        )
        if not token:
            return Response(
                {"detail": "That reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = token.user
        with transaction.atomic():
            token.consume()
            user.set_password(serializer.validated_data["new_password"])
            user.save(update_fields=["password"])
            # A password reset should end every existing session. Blacklisting
            # the stored rows directly avoids re-parsing already-expired JWTs.
            for outstanding in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=outstanding)

        log_action(request, AuditLog.Action.UPDATE, user, {"password": "reset"})
        return Response({"detail": "Password updated. You can now sign in."})
