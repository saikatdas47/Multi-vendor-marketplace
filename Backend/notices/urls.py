from rest_framework.routers import DefaultRouter

from .views import AdminNoticeViewSet, SellerNoticeViewSet

router = DefaultRouter()
router.register("admin/notices", AdminNoticeViewSet, basename="admin-notice")
router.register("seller/notices", SellerNoticeViewSet, basename="seller-notice")

urlpatterns = router.urls
