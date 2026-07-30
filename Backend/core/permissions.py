"""Reusable RBAC permission classes."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    message = "Admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin_role)


class IsSeller(BasePermission):
    message = "Seller account required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_seller)


class IsApprovedSeller(BasePermission):
    message = "Your seller account is pending approval."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_seller):
            return False
        profile = getattr(user, "seller_profile", None)
        return bool(profile and profile.is_approved)


class IsCustomer(BasePermission):
    message = "Customer account required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_customer)


class IsCustomerOrAnonymous(BasePermission):
    """The marketplace-facing audience: shoppers and visitors, nobody else.

    Anonymous is allowed on purpose — browsing and asking the assistant before
    signing up is the point. Sellers and admins are refused: neither shops here,
    and a seller with assistant access would effectively have a competitor
    catalogue search tool.

    This can't be expressed as ``IsCustomer`` (which requires authentication) or
    ``AllowAny`` (which lets every role in), so it needs its own class.
    """

    message = "This is available to customers only."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return True
        return bool(user.is_customer)


class IsOwnerOrReadOnly(BasePermission):
    """Object-level: anyone may read, only the owner may write.

    Set ``owner_field`` on the view to point at the FK holding the owner.
    """

    message = "You do not own this resource."

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        owner_field = getattr(view, "owner_field", "user")
        owner = obj
        for part in owner_field.split("."):
            owner = getattr(owner, part, None)
        return owner == request.user


class IsSellerOwnerOrAdmin(BasePermission):
    """Writes allowed for the owning seller or any admin."""

    message = "Only the owning seller or an admin may modify this."

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin_role or user.is_staff:
            return True
        owner_field = getattr(view, "owner_field", "seller.user")
        owner = obj
        for part in owner_field.split("."):
            owner = getattr(owner, part, None)
        return owner == user
