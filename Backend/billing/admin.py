from django.contrib import admin

from .models import Invoice


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("seller", "period", "amount", "status", "due_date", "paid_at")
    list_filter = ("status", "period")
    search_fields = ("seller__shop_name", "payment_reference")
    readonly_fields = ("submitted_at", "paid_at", "confirmed_by")
    date_hierarchy = "period"
