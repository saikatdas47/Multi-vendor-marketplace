"""No tables of our own — the shop *is* the seller profile.

A seller owns exactly one shop, so splitting shop identity into its own table
would add a join to every product card and buy nothing. ``Product.seller`` and
``OrderItem.seller`` both point at ``SellerProfile`` already; retargeting them
would be a destructive migration with no payoff.

What this app owns is the public storefront *API surface*, which previously sat
in ``accounts`` alongside auth, addresses and admin user management.
"""

from accounts.models import SellerProfile as Shop  # noqa: F401  (re-export)

__all__ = ["Shop"]
