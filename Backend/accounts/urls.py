from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views_email import (
    ForgotPasswordView,
    ResetPasswordView,
    SendVerificationView,
    VerifyEmailView,
)
from .views import (
    AddressViewSet,
    AdminDashboardView,
    AdminSellerViewSet,
    AdminUserViewSet,
    AuditLogViewSet,
    ChangePasswordView,
    CustomerProfileView,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
    SellerProfileView,
)

router = DefaultRouter()
router.register("addresses", AddressViewSet, basename="address")
router.register("admin/users", AdminUserViewSet, basename="admin-user")
router.register("admin/sellers", AdminSellerViewSet, basename="admin-seller")
router.register("admin/audit-logs", AuditLogViewSet, basename="audit-log")

app_name = "accounts"

urlpatterns = [
    path("admin/dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/verify/", TokenVerifyView.as_view(), name="token-verify"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path(
        "auth/send-verification/",
        SendVerificationView.as_view(),
        name="send-verification",
    ),
    path("auth/verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path("auth/forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("auth/reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    path("profile/customer/", CustomerProfileView.as_view(), name="customer-profile"),
    path("profile/seller/", SellerProfileView.as_view(), name="seller-profile"),
    path("", include(router.urls)),
]
