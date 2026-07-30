from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Address, AuditLog, CustomerProfile, SellerProfile, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "first_name", "last_name", "role", "is_active", "created_at")
    list_filter = ("role", "is_active", "is_staff", "email_verified")
    search_fields = ("email", "first_name", "last_name", "phone")
    ordering = ("-created_at",)
    readonly_fields = ("created_at", "updated_at", "last_login")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("first_name", "last_name", "phone", "avatar")}),
        ("Role & status", {"fields": ("role", "email_verified", "is_active")}),
        ("Permissions", {"fields": ("is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "role", "password1", "password2"),
            },
        ),
    )


@admin.register(SellerProfile)
class SellerProfileAdmin(admin.ModelAdmin):
    list_display = ("shop_name", "user", "status", "commission_rate", "created_at")
    list_filter = ("status",)
    search_fields = ("shop_name", "user__email")
    prepopulated_fields = {"slug": ("shop_name",)}


@admin.register(CustomerProfile)
class CustomerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "newsletter_opt_in", "created_at")
    search_fields = ("user__email",)


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("full_name", "user", "kind", "city", "country", "is_default")
    list_filter = ("kind", "country", "is_default")
    search_fields = ("full_name", "user__email", "city", "postal_code")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "target_model", "target_id")
    list_filter = ("action", "target_model")
    search_fields = ("actor__email", "target_id")
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
