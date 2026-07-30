from rest_framework.routers import DefaultRouter

from .views import AdminInvoiceViewSet, SellerInvoiceViewSet

router = DefaultRouter()
router.register("seller/invoices", SellerInvoiceViewSet, basename="seller-invoice")
router.register("admin/invoices", AdminInvoiceViewSet, basename="admin-invoice")

urlpatterns = router.urls
