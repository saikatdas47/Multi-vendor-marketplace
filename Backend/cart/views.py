from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsCustomer
from products.models import Product

from .models import Cart, CartItem, WishlistItem
from .serializers import (
    AddToCartSerializer,
    CartItemSerializer,
    CartSerializer,
    UpdateCartItemSerializer,
    WishlistItemSerializer,
)


def get_cart(user):
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


@extend_schema(tags=["cart"], summary="Retrieve the current user's cart")
class CartView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        return Response(CartSerializer(get_cart(request.user), context={"request": request}).data)

    @extend_schema(summary="Empty the cart")
    def delete(self, request):
        get_cart(request.user).items.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    create=extend_schema(tags=["cart"], summary="Add an item to the cart"),
    partial_update=extend_schema(tags=["cart"], summary="Change item quantity"),
    destroy=extend_schema(tags=["cart"], summary="Remove an item"),
)
class CartItemViewSet(viewsets.GenericViewSet):
    permission_classes = [IsCustomer]
    serializer_class = CartItemSerializer

    def get_queryset(self):
        return CartItem.objects.filter(cart__user=self.request.user).select_related(
            "product", "variant"
        )

    def _cart_response(self, request, http_status=status.HTTP_200_OK):
        cart = get_cart(request.user)
        return Response(
            CartSerializer(cart, context={"request": request}).data, status=http_status
        )

    @extend_schema(request=AddToCartSerializer, responses=CartSerializer)
    def create(self, request):
        serializer = AddToCartSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        product = serializer.validated_data["product_obj"]
        variant = serializer.validated_data["variant_obj"]
        quantity = serializer.validated_data["quantity"]
        cart = get_cart(request.user)

        with transaction.atomic():
            # Lock the product row so two tabs can't both pass the stock check.
            locked = Product.objects.select_for_update().get(pk=product.pk)
            stock = variant.stock if variant else locked.stock

            item = CartItem.objects.filter(
                cart=cart, product=locked, variant=variant
            ).first()
            desired = (item.quantity if item else 0) + quantity

            if stock == 0:
                raise ValidationError({"quantity": "This product is out of stock."})
            if desired > stock:
                raise ValidationError(
                    {
                        "quantity": (
                            f"Only {stock} available."
                            + (f" You already have {item.quantity} in your cart." if item else "")
                        )
                    }
                )

            unit_price = locked.price + (variant.price_delta if variant else 0)
            if item:
                item.quantity = desired
                item.unit_price = unit_price
                item.save(update_fields=["quantity", "unit_price", "updated_at"])
            else:
                CartItem.objects.create(
                    cart=cart,
                    product=locked,
                    variant=variant,
                    quantity=quantity,
                    unit_price=unit_price,
                )

        return self._cart_response(request, status.HTTP_201_CREATED)

    @extend_schema(request=UpdateCartItemSerializer, responses=CartSerializer)
    def partial_update(self, request, pk=None):
        item = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity"]

        if quantity > item.available_stock:
            raise ValidationError({"quantity": f"Only {item.available_stock} available."})

        item.quantity = quantity
        item.save(update_fields=["quantity", "updated_at"])
        return self._cart_response(request)

    def destroy(self, request, pk=None):
        get_object_or_404(self.get_queryset(), pk=pk).delete()
        return self._cart_response(request)

    @extend_schema(
        tags=["cart"],
        summary="Accept the new price after a price change",
        responses=CartSerializer,
    )
    @action(detail=True, methods=["post"], url_path="resync-price")
    def resync_price(self, request, pk=None):
        item = get_object_or_404(self.get_queryset(), pk=pk)
        item.resync_price()
        return self._cart_response(request)


@extend_schema_view(
    list=extend_schema(tags=["wishlist"], summary="My wishlist"),
    create=extend_schema(tags=["wishlist"], summary="Add to wishlist"),
    destroy=extend_schema(tags=["wishlist"], summary="Remove from wishlist"),
)
class WishlistViewSet(viewsets.ModelViewSet):
    serializer_class = WishlistItemSerializer
    permission_classes = [IsCustomer]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return WishlistItem.objects.filter(user=self.request.user).select_related(
            "product", "product__seller", "product__category"
        )

    @extend_schema(tags=["wishlist"], summary="Toggle a product in the wishlist")
    @action(detail=False, methods=["post"])
    def toggle(self, request):
        product_id = request.data.get("product")
        if not product_id:
            raise ValidationError({"product": "This field is required."})
        if not Product.objects.filter(pk=product_id).exists():
            raise ValidationError({"product": "Product not found."})

        existing = WishlistItem.objects.filter(
            user=request.user, product_id=product_id
        ).first()
        if existing:
            existing.delete()
            return Response({"wishlisted": False})

        WishlistItem.objects.create(user=request.user, product_id=product_id)
        return Response({"wishlisted": True}, status=status.HTTP_201_CREATED)

    @extend_schema(tags=["wishlist"], summary="Move a wishlist item into the cart")
    @action(detail=True, methods=["post"], url_path="move-to-cart")
    def move_to_cart(self, request, pk=None):
        item = get_object_or_404(self.get_queryset(), pk=pk)
        product = item.product

        if product.status != Product.Status.PUBLISHED:
            raise ValidationError({"product": "This product is no longer available."})
        if product.stock == 0:
            raise ValidationError({"product": "This product is out of stock."})

        cart = get_cart(request.user)
        cart_item, created = CartItem.objects.get_or_create(
            cart=cart,
            product=product,
            variant=None,
            defaults={"quantity": 1, "unit_price": product.price},
        )
        if not created:
            if cart_item.quantity + 1 > product.stock:
                raise ValidationError({"quantity": f"Only {product.stock} available."})
            cart_item.quantity += 1
            cart_item.save(update_fields=["quantity", "updated_at"])

        item.delete()
        return Response(CartSerializer(cart, context={"request": request}).data)
