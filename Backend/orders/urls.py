from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminOrderViewSet,
    CheckoutView,
    OrderViewSet,
    SellerOrderItemViewSet,
)

router = DefaultRouter()
router.register("orders", OrderViewSet, basename="order")
router.register("seller/order-items", SellerOrderItemViewSet, basename="seller-order-item")
router.register("admin/orders", AdminOrderViewSet, basename="admin-order")

app_name = "orders"

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("", include(router.urls)),
]
