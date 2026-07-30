import django_filters as filters
from django.db.models import F

from .models import Category, Product


class ProductFilter(filters.FilterSet):
    """Query params: ?min_price=&max_price=&category=&seller=&in_stock=&rating_gte="""

    min_price = filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = filters.NumberFilter(field_name="price", lookup_expr="lte")
    category = filters.CharFilter(method="filter_category")
    seller = filters.CharFilter(field_name="seller__slug", lookup_expr="iexact")
    in_stock = filters.BooleanFilter(method="filter_in_stock")
    on_sale = filters.BooleanFilter(method="filter_on_sale")
    is_featured = filters.BooleanFilter()
    rating_gte = filters.NumberFilter(field_name="avg_rating", lookup_expr="gte")

    class Meta:
        model = Product
        fields = ["status", "is_featured"]

    def filter_category(self, queryset, name, value):
        """Accepts a category slug and includes every descendant category."""
        category = Category.objects.filter(slug=value).first()
        if not category:
            return queryset.none()
        return queryset.filter(category_id__in=category.descendant_ids())

    def filter_in_stock(self, queryset, name, value):
        return queryset.filter(stock__gt=0) if value else queryset.filter(stock=0)

    def filter_on_sale(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(
            compare_at_price__isnull=False, compare_at_price__gt=F("price")
        )
