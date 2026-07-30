from django.urls import path

from .views import ShopDetailView, ShopListView

urlpatterns = [
    path("shops/", ShopListView.as_view(), name="shop-list"),
    path("shops/<slug:slug>/", ShopDetailView.as_view(), name="shop-detail"),
]
