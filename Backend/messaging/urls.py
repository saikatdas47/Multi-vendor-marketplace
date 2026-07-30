from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminSendMessageView,
    AdminThreadViewSet,
    SellerThreadView,
    SellerUnreadView,
)

router = DefaultRouter()
router.register("admin/conversations", AdminThreadViewSet, basename="admin-conversation")

urlpatterns = router.urls + [
    path(
        "admin/sellers/<int:seller_id>/message/",
        AdminSendMessageView.as_view(),
        name="admin-send-message",
    ),
    path("seller/thread/", SellerThreadView.as_view(), name="seller-thread"),
    path(
        "seller/thread/unread-count/",
        SellerUnreadView.as_view(),
        name="seller-thread-unread",
    ),
]
