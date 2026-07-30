from django.contrib import admin

from .models import Category, Product, ProductImage, ProductVariant, Review


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "parent", "is_active", "sort_order")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "seller", "category", "price", "stock", "status", "created_at")
    list_filter = ("status", "is_featured", "category")
    search_fields = ("name", "sku", "seller__shop_name")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductImageInline, ProductVariantInline]
    readonly_fields = ("view_count", "created_at", "updated_at")
    list_select_related = ("seller", "category")


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("product", "user", "rating", "is_approved", "created_at")
    list_filter = ("rating", "is_approved", "is_verified_purchase")
    search_fields = ("product__name", "user__email")
