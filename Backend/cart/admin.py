from django.contrib import admin

from .models import Cart, CartItem, WishlistItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    readonly_fields = ("unit_price",)


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("user", "distinct_items", "subtotal", "updated_at")
    search_fields = ("user__email",)
    inlines = [CartItemInline]


@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "created_at")
    search_fields = ("user__email", "product__name")
    list_select_related = ("user", "product")
