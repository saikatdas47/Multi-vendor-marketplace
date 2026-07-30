from django.contrib import admin

from .models import Order, OrderEvent, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    # Snapshots are historical records; editing them would rewrite history.
    readonly_fields = (
        "product", "product_name", "product_sku", "variant_label",
        "seller_name", "unit_price", "quantity", "stock_released",
    )
    can_delete = False


class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 0
    readonly_fields = ("status", "note", "actor", "created_at")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "number", "customer_email", "status", "payment_status", "total", "placed_at",
    )
    list_filter = ("status", "payment_status", "payment_method")
    search_fields = ("number", "customer_email", "ship_to_name")
    readonly_fields = ("number", "subtotal", "total", "placed_at", "created_at")
    inlines = [OrderItemInline, OrderEventInline]
    date_hierarchy = "placed_at"


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ("order", "product_name", "seller_name", "quantity", "status")
    list_filter = ("status",)
    search_fields = ("order__number", "product_name", "product_sku")
    list_select_related = ("order",)
