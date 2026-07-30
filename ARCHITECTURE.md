# CommerceX — Target Architecture

A reorganization plan for the existing system. Nothing here proposes rewriting a
working feature. Every item is either a **module move**, an **additive schema
change**, or **something the spec requires that does not exist yet**.

Legend used throughout:

| Tag | Meaning |
|---|---|
| `[keep]` | Exists and is correct. Do not touch. |
| `[move]` | Same code, different module. No behaviour change. |
| `[add]` | New field, model, endpoint or file. |
| `[change]` | Existing behaviour is wrong for the spec and must change. |
| `[defer]` | In the design, deliberately not in phase 1. |

---

## 0. One recommendation I want to flag before the detail

**I am not proposing to split `SellerProfile` into a separate `Shop` table, and I
think you should not either.**

The obvious reading of "cleaner database" is to pull shop identity out of
`accounts.SellerProfile` into `shops.Shop`. I looked at what that actually buys
and concluded it is churn:

- Your spec says **"Seller owns one shop only."** A strict 1:1 with no prospect
  of 1:N is the textbook case for keeping one table. A separate table adds a join
  to every product card render (`Product → SellerProfile → Shop` for a shop name)
  and buys no capability.
- `Product.seller` and `OrderItem.seller` both FK to `SellerProfile`. For the
  split to be worth anything those would have to become `.shop`, which is a
  destructive FK migration across your two largest tables — exactly the risk you
  chose to avoid.

The genuine mess is not the table, it's the **module**. `accounts/urls.py`
currently serves auth, addresses, customer profiles, seller profiles, admin user
management, admin seller approval, audit logs *and* the public shop list. That is
what needs splitting.

So: **the table stays, the module splits.** You get the clean architecture
without the migration risk. If you later need multi-shop sellers, the split is a
separate, deliberate migration — and this plan doesn't make it harder.

Everything below follows from that decision.

---

## 1. What the audit actually found

I read the current code rather than working from the feature list. Six findings
drive most of the plan.

**1.1 There is no admin frontend.** `App.jsx:93` is:

```jsx
<Route element={<RequireAuth roles={['admin']} />}>
  <Route path="admin" element={<Navigate to="/account" replace />} />
</Route>
```

The admin APIs exist (`/admin/users/`, `/admin/sellers/`, `/admin/audit-logs/`,
`/admin/orders/`) and `adminApi` is wired in `endpoints.js`. There is no UI on
top of any of it. For admin, "reorganize" means "build".

**1.2 All three roles share the customer shell.** `ChatWidget` is mounted at
`Layout.jsx:455` and `SmartSearch` at `:211` and `:253`, unconditionally. An
admin sees the AI assistant, the product search bar and the cart icon. The spec
forbids all three. `Layout` is *partly* role-aware — it conditionally adds
dashboard links at `:52-53` — which is the wrong shape: one layout branching on
role, instead of one layout per role.

**1.3 Role separation is not enforced on the backend.** Confirmed:

| View | Current permission | Spec requires |
|---|---|---|
| `cart.CartView` | `IsAuthenticated` | `IsCustomer` |
| `cart.CartItemViewSet` | `IsAuthenticated` | `IsCustomer` |
| `cart.WishlistViewSet` | `IsAuthenticated` | `IsCustomer` |
| `orders.CheckoutView` | `IsAuthenticated` | `IsCustomer` |
| `orders.OrderViewSet` | `IsAuthenticated` | `IsCustomer` |
| `assistant.AskView` | `AllowAny` | anon + customer only |

`core.permissions.IsCustomer` already exists and is simply not used in these
places. Route guards alone are not enough — a seller with a JWT can `POST
/api/v1/cart/items/` today with curl.

**1.4 Banning is implemented as `User.is_active = False`.** `adminApi` calls
`/admin/users/<id>/toggle-active/`. That blocks login, which means a banned
seller cannot sign in to read *why* they were banned, and cannot reply to the
admin — both of which your spec asks for ("Receive admin notices / Reply to
admin"). This needs to move to `SellerProfile.status`, which **already has a
`SUSPENDED` choice** that nothing currently sets.

**1.5 Shop identity is being mashed into one column.** From `seed_demo.py`:

```python
"description": f"{shop['tagline']}\n\n{shop['description']}",
```

Two distinct fields concatenated because there is only one column. That is a
real normalization defect, and it is why there is no shop banner or tagline to
render on a shop page. Cheap to fix additively.

**1.6 Reviews have no reply path and there is no messaging at all.** Three
tables' worth of the spec does not exist.

---

## 2. Database structure

### 2.1 What stays exactly as it is

These are correct and get no migration:

`accounts_user`, `accounts_customer_profile`, `accounts_address`,
`accounts_audit_log`, `accounts_email_token`, `products_category`,
`products_product`, `products_product_image`, `products_product_variant`,
`cart_cart`, `cart_cart_item`, `cart_wishlist_item`, `orders_order`,
`orders_order_item`, `orders_order_event`, `assistant_chat_session`,
`assistant_chat_message`.

Worth saying why, since "reorganize the database" invites churn: the price and
product snapshots on `order_item`, the `SET_NULL` on `order_item.product`, the
UUID PKs on public-facing rows, the soft-delete manager pair, and the partial
unique constraints are all already right. Changing them would be a regression.

### 2.2 `accounts_seller_profile` — the shop aggregate `[change]` `[add]`

This table is the shop. Making that explicit:

```python
class SellerProfile(TimeStampedModel):
    # --- identity: unchanged -------------------------------------------
    user            = OneToOneField(User, related_name="seller_profile")   # [keep]
    shop_name       = CharField(max_length=150, unique=True)               # [keep]
    slug            = SlugField(max_length=170, unique=True)               # [keep]
    logo            = ImageField(upload_to="shops/logos/")                 # [keep]

    # --- storefront: currently missing or concatenated -----------------
    tagline         = CharField(max_length=160, blank=True)                # [add]
    description     = TextField(blank=True)                                # [change] tagline no longer prefixed
    banner          = ImageField(upload_to="shops/banners/", null=True)    # [add]
    shipping_policy = TextField(blank=True)                                # [add]
    return_policy   = TextField(blank=True)                                # [add]

    # --- commercial: unchanged -----------------------------------------
    business_email  = EmailField(blank=True)                               # [keep]
    business_phone  = CharField(max_length=20, blank=True)                 # [keep]
    tax_id          = CharField(max_length=60, blank=True)                 # [keep]
    commission_rate = DecimalField(max_digits=5, decimal_places=2)         # [keep]

    # --- lifecycle: SUSPENDED exists but nothing sets it ---------------
    status          = CharField(choices=Status.choices)                    # [keep]
    approved_at     = DateTimeField(null=True)                             # [keep]
    approved_by     = ForeignKey(User, null=True, ...)                     # [keep]
    rejection_reason= TextField(blank=True)                                # [keep]
    suspended_at    = DateTimeField(null=True, blank=True)                 # [add]
    suspended_by    = ForeignKey(User, null=True, related_name="+")        # [add]
    suspension_reason = TextField(blank=True)                              # [add]

    class Meta:
        indexes = [Index(fields=["status", "-created_at"])]                 # [add]
```

This is the **only** new index needed on an existing table. The admin approval
queue is `filter(status=PENDING).order_by("-created_at")` and that is the admin's
landing query; everything else the plan touches is already indexed (§2.5).

**Ban semantics `[change]`.** `SUSPENDED` is the ban state. Rules:

- Ban and unban only move between `APPROVED ⇄ SUSPENDED`. A `PENDING` seller is
  rejected, not banned — different action, different field.
- Unban restores `APPROVED` and clears the three suspension fields.
- **`User.is_active` is never touched by ban.** A suspended seller can still log
  in, lands on a blocking notice screen, and can reply to the admin. Reserve
  `is_active` for account deletion.
- `IsApprovedSeller` already gates on `profile.is_approved`, so suspending
  correctly locks every seller write with no new permission code.
- Every ban/unban/approve/reject writes an `AuditLog` row. That table exists and
  has `actor`, `action`, `target_model`, `target_id`, `changes` — reuse it rather
  than inventing a moderation log.

### 2.3 `products_review_reply` `[add]`

One public reply per review, from the shop that owns the product.

```python
class ReviewReply(TimeStampedModel):
    review = OneToOneField(Review, on_delete=CASCADE, related_name="reply")
    author = ForeignKey(User, on_delete=SET_NULL, null=True, related_name="review_replies")
    body   = TextField()

    class Meta:
        db_table = "products_review_reply"
```

`OneToOneField` rather than FK-with-a-thread: a public reply is the shop's single
statement of record, and a thread here would duplicate what messaging is for.
`SET_NULL` on author so deleting a staff user doesn't delete the shop's reply.

Authorization is `review.product.seller.user == request.user`, checked in the
view — not a DB constraint, because the product's owner can change.

### 2.4 Messaging `[add]` `[defer]`

Both channels, one app. Designed now, built in phase 5.

```python
class Conversation(UUIDModel, TimeStampedModel):
    """Customer <-> one shop. Scoped to a shop, not to a product."""
    customer      = ForeignKey(User, on_delete=CASCADE, related_name="conversations")
    shop          = ForeignKey(SellerProfile, on_delete=CASCADE, related_name="conversations")
    subject       = CharField(max_length=160, blank=True)
    # Denormalised so the inbox list needs no subquery per row.
    last_message_at    = DateTimeField(db_index=True)
    customer_unread    = PositiveIntegerField(default=0)
    shop_unread        = PositiveIntegerField(default=0)

    class Meta:
        constraints = [UniqueConstraint(fields=["customer", "shop"], name="uniq_conversation_pair")]
        indexes = [Index(fields=["shop", "-last_message_at"]),
                   Index(fields=["customer", "-last_message_at"])]


class Message(UUIDModel):
    conversation = ForeignKey(Conversation, on_delete=CASCADE, related_name="messages")
    sender       = ForeignKey(User, on_delete=SET_NULL, null=True)
    body         = TextField()
    created_at   = DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [Index(fields=["conversation", "created_at"])]
```

Design notes worth defending in an interview:

- **One conversation per (customer, shop)** rather than per product. A shopper
  asking about two items from the same shop expects one thread. The unique
  constraint enforces it, so "start a conversation" is a `get_or_create`.
- **`last_message_at` and the two unread counters are denormalised on purpose.**
  The seller inbox is "threads ordered by recency with an unread badge". Deriving
  that per row is an N+1 or a window function; a counter maintained in the same
  transaction as the insert is one indexed read.
- **Two counters, not one.** Unread is per side. A single `is_read` flag on
  `Message` forces a `COUNT(*)` per thread to render a badge.

Admin notices are a different shape — one author, many recipients, replies go
back to one place:

```python
class AdminNotice(UUIDModel, TimeStampedModel):
    author    = ForeignKey(User, on_delete=SET_NULL, null=True)
    subject   = CharField(max_length=160)
    body      = TextField()
    # Recorded so "sent to all sellers" is distinguishable from "sent to these 40".
    audience  = CharField(choices=[("all", "All sellers"), ("selected", "Selected sellers")])


class NoticeRecipient(UUIDModel):
    notice  = ForeignKey(AdminNotice, on_delete=CASCADE, related_name="recipients")
    seller  = ForeignKey(SellerProfile, on_delete=CASCADE, related_name="notices")
    read_at = DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [UniqueConstraint(fields=["notice", "seller"], name="uniq_notice_recipient")]
        indexes = [Index(fields=["seller", "read_at"])]


class NoticeReply(UUIDModel, TimeStampedModel):
    recipient = ForeignKey(NoticeRecipient, on_delete=CASCADE, related_name="replies")
    sender    = ForeignKey(User, on_delete=SET_NULL, null=True)
    body      = TextField()
```

**Recipient rows are materialised even for "all sellers."** The alternative — an
`audience="all"` flag resolved at read time — cannot store per-seller `read_at`,
and a seller who registers after the notice was sent would retroactively receive
it. Writing rows costs one bulk insert and makes read state and reply threading
trivial. `audience` is kept only so the admin UI can say "sent to all sellers"
instead of listing 40 names.

### 2.5 Index additions `[add]`

Only one index is missing on the existing tables. I checked the rest rather than
assuming:

| Table | Index | Status | Query it serves |
|---|---|---|---|
| `accounts_seller_profile` | `(status, -created_at)` | `[add]` | admin approval queue |
| `products_product` | `(seller_id, status)` | **already present** | seller product list, shop page |
| `orders_order_item` | `(seller_id, status)` | **already present** | seller order list |
| `messaging_conversation` | `(shop_id, -last_message_at)` | `[add]` phase 5 | seller inbox |
| `messaging_conversation` | `(customer_id, -last_message_at)` | `[add]` phase 5 | customer inbox |
| `messaging_notice_recipient` | `(seller_id, read_at)` | `[add]` phase 5 | seller unread notice badge |

`products_product` already carries four indexes including `(seller, status)` and
`(category, status)`, and `orders_order_item` carries `(order, status)` and
`(seller, status)`. The seller dashboard and shop pages need no new indexes at
all — worth knowing before anyone "optimises" them.

### 2.6 Migration path

Every step is additive. No table renames, no FK retargeting, no data loss.

```
accounts/migrations/00XX_shop_storefront_and_suspension.py
    add tagline, banner, shipping_policy, return_policy
    add suspended_at, suspended_by, suspension_reason
    add index (status, -created_at)

products/migrations/00XX_review_reply.py
    create products_review_reply
    add index (seller_id, status) on products_product

messaging/migrations/0001_initial.py          # phase 5
    create conversation, message, admin_notice, notice_recipient, notice_reply
```

One optional data migration, for the concatenated field found in 1.5:

```python
def split_tagline(apps, schema_editor):
    """Recover the tagline that seed_demo concatenated into description.

    Only touches rows that still match the "tagline\n\ndescription" shape, so
    it is safe to re-run and safe on shops a seller has since edited by hand.
    """
    Shop = apps.get_model("accounts", "SellerProfile")
    for shop in Shop.objects.filter(tagline="", description__contains="\n\n"):
        head, _, rest = shop.description.partition("\n\n")
        if len(head) <= 160 and rest:
            shop.tagline, shop.description = head, rest
            shop.save(update_fields=["tagline", "description"])
```

Guard `tagline=""` so it is idempotent; guard `len(head) <= 160` so it cannot
overflow the new column. Ship it with a no-op `reverse_code` — the split is not
losslessly reversible and pretending otherwise is worse than declining.

---

## 3. Django module organization

### 3.1 Target app layout

```
Backend/
  backend/            # settings, root urls, wsgi            [keep]
  core/               # base models, permissions, ai.py       [keep]
  accounts/           # User, profiles, addresses, auth       [change: shrinks]
  shops/              # storefront read + seller's own shop   [add]
  products/           # Category, Product, images, variants,
                      # Review, ReviewReply                   [keep + add]
  cart/               # Cart, CartItem, WishlistItem          [keep]
  orders/             # Order, OrderItem, OrderEvent          [keep]
  messaging/          # Conversation, Message, AdminNotice    [add, phase 5]
  adminpanel/         # every admin-only endpoint             [add]
  assistant/          # AI retrieval + chat                   [keep]
```

Three new apps, and the count is deliberate — `shops` and `adminpanel` are
boundary-drawing apps, `messaging` is the only one that adds real domain.

### 3.2 Why `accounts` has to shrink

Today `accounts/urls.py` registers all of this:

```
addresses/           auth/register/          admin/users/
profile/customer/    auth/login/             admin/sellers/
profile/seller/      auth/refresh/           admin/audit-logs/
shops/               auth/forgot-password/   ...
```

Four unrelated concerns in one router: identity, the public shop directory, the
seller's own shop settings, and the entire admin surface. After the split:

| Concern | Lands in | Note |
|---|---|---|
| register / login / refresh / verify / reset | `accounts` | `[keep]` |
| `User`, `CustomerProfile`, `SellerProfile` models | `accounts` | `[keep]` — models stay put, so no table renames |
| `addresses/` | `accounts` | `[keep]` — belongs to the person, not the shop |
| `shops/` public list + detail | `shops` | `[move]` |
| `profile/seller/` → seller's shop settings | `shops` | `[move]` |
| `admin/users/`, `admin/sellers/`, `admin/audit-logs/` | `adminpanel` | `[move]` |
| `admin/orders/` (currently in `orders/urls.py`) | `adminpanel` | `[move]` |

### 3.3 `shops` — an app with views but no models

`shops/` contains `serializers.py`, `views.py`, `urls.py`, `filters.py` and no
`models.py` of its own. It reads and writes `accounts.SellerProfile`.

This is unusual enough to justify: the alternative is moving the model, which
renames `accounts_seller_profile` and retargets two FKs. Django is perfectly
happy with an app that owns an API surface over another app's model, and the
import direction stays clean (`shops → accounts`, never the reverse).

If it helps readability, alias it at the top of the module:

```python
# shops/models.py — no tables of our own; the shop *is* the seller profile.
from accounts.models import SellerProfile as Shop  # noqa: F401
```

### 3.4 `adminpanel` — one app so the boundary is auditable

Every admin-only endpoint in one app, with a module-level default:

```python
# adminpanel/views.py
class AdminViewSet(viewsets.ModelViewSet):
    """Base for everything in this app. IsAdmin is not optional here."""
    permission_classes = [IsAdmin]
```

The payoff is a one-line audit: **if a route is not under `adminpanel/`, admin
privilege is not required to reach it.** With admin endpoints scattered across
`accounts` and `orders`, that question needs a full grep every time.

`adminpanel` also owns no models. `AdminNotice` lives in `messaging`, because a
notice is a message; `adminpanel` exposes the *sending* endpoint.

### 3.5 Per-app file convention

Applied consistently, so a new app is predictable:

```
<app>/
  models.py          # or absent for shops/ and adminpanel/
                     # (note: accounts also keeps EmailToken in tokens.py —
                     #  a model outside models.py is fine, it just needs
                     #  importing somewhere Django loads)
  serializers.py     # split into serializers/ package only past ~400 lines
  views.py
  urls.py            # router + explicit paths, no logic
  permissions.py     # only app-specific rules; shared ones live in core/
  filters.py         # django-filter FilterSets
  services.py        # multi-step writes that must be atomic
  tests.py           # or tests/ package
```

`services.py` is the one convention worth enforcing. Checkout already belongs
there: locking stock, deducting it, snapshotting prices and writing
`OrderEvent` rows is a transaction script, not view logic. Same for
ban/unban (status + audit log + notice) and sending a notice (notice + N
recipient rows). Views stay thin enough to read in one screen.

---

## 4. Backend API grouping

### 4.1 Grouping principle

Prefix by **who the endpoint is for**, not by which app implements it. A reader
should be able to tell the required role from the URL alone.

| Prefix | Audience | Default permission |
|---|---|---|
| `/api/v1/auth/…` | anonymous + any signed-in user | `AllowAny` / `IsAuthenticated` |
| `/api/v1/categories,products,shops,reviews/…` | anonymous + customer | `AllowAny` (read-only) |
| `/api/v1/me/…` | customer only | `IsCustomer` |
| `/api/v1/seller/…` | seller only | `IsApprovedSeller` |
| `/api/v1/admin/…` | admin only | `IsAdmin` |
| `/api/v1/assistant/…` | anonymous + customer | `AllowAny`, blocked for seller/admin |

### 4.2 Target route table

`[keep]` paths are unchanged, so the frontend keeps working during the move.

**Public catalogue** — read-only, no role required.

```
GET    /categories/                     [keep]
GET    /categories/tree/                [keep]
GET    /products/                       [keep]
GET    /products/<slug>/                [keep]
GET    /products/<slug>/reviews/        [keep]
GET    /products/<slug>/ai-summary/     [keep]
GET    /shops/                          [move]  accounts -> shops
GET    /shops/<slug>/                   [add]   shop detail page
GET    /shops/<slug>/products/          [add]   shop's catalogue
```

**Auth** — unchanged, all eleven paths `[keep]`.

```
POST   /auth/register/  /auth/login/  /auth/logout/  /auth/refresh/  /auth/verify/
GET    /auth/me/          PATCH /auth/me/
POST   /auth/change-password/  /auth/send-verification/  /auth/verify-email/
POST   /auth/forgot-password/  /auth/reset-password/
```

**Customer** — `IsCustomer`. Currently mounted at the root and permissioned
`IsAuthenticated`; both change.

```
GET    /me/cart/                        [change] from /cart/
POST   /me/cart/items/                  [change] from /cart/items/
PATCH  /me/cart/items/<id>/             [change]
DELETE /me/cart/items/<id>/             [change]
POST   /me/cart/items/<id>/resync-price/[change]
GET    /me/wishlist/                    [change] from /wishlist/
POST   /me/wishlist/toggle/             [change]
POST   /me/wishlist/<id>/move-to-cart/  [change]
POST   /me/checkout/                    [change] from /checkout/
GET    /me/orders/                      [change] from /orders/
GET    /me/orders/<number>/             [change]
POST   /me/orders/<number>/cancel/      [change]
GET    /me/addresses/                   [change] from /addresses/
POST   /me/reviews/                     [change] from /reviews/
PATCH  /me/reviews/<id>/                [change]
GET    /me/conversations/               [add]  phase 5
POST   /me/conversations/               [add]  phase 5
GET    /me/conversations/<id>/messages/ [add]  phase 5
POST   /me/conversations/<id>/messages/ [add]  phase 5
```

The `/me/` move is cosmetic and the `IsCustomer` tightening is not. **Do the
permission change in phase 2 and the path rename in phase 6**, so a URL refactor
never rides along with a security change — if something breaks you want to know
which one did it.

**Seller** — `IsApprovedSeller`.

```
GET    /seller/dashboard/               [add]   consolidates the overview stats
GET    /seller/shop/    PATCH …         [move]  from /profile/seller/
POST   /seller/shop/logo/               [add]
POST   /seller/shop/banner/             [add]
GET    /seller/products/                [change] from /products/?mine=1
POST   /seller/products/                [change] from POST /products/
PATCH  /seller/products/<slug>/         [change]
DELETE /seller/products/<slug>/         [change]
POST   /seller/products/<slug>/stock/   [change] from /products/<slug>/adjust-stock/
GET    /seller/inventory/low-stock/     [change] from /products/low-stock/
GET    /seller/orders/                  [move]  from /seller/order-items/
GET    /seller/orders/summary/          [move]
PATCH  /seller/orders/<id>/status/      [move]
GET    /seller/reviews/                 [add]
POST   /seller/reviews/<id>/reply/      [add]
PATCH  /seller/reviews/<id>/reply/      [add]
GET    /seller/conversations/           [add]  phase 5
POST   /seller/conversations/<id>/messages/  [add]  phase 5
GET    /seller/notices/                 [add]  phase 5
POST   /seller/notices/<id>/reply/      [add]  phase 5
POST   /seller/ai/draft-listing/        [move] from /ai/draft-listing/
```

Note `/seller/products/` replacing `/products/?mine=1`: a shared endpoint that
changes its result set based on the caller's role is the pattern that produces
data leaks. Two endpoints with two permission classes cannot leak into each
other.

**Admin** — `IsAdmin`. Deliberately small; the spec says keep it focused.

```
GET    /admin/dashboard/                [add]
GET    /admin/sellers/                  [move]  ?status=pending drives the queue
GET    /admin/sellers/<id>/             [move]
POST   /admin/sellers/<id>/approve/     [change] from generic review-seller
POST   /admin/sellers/<id>/reject/      [change]
POST   /admin/sellers/<id>/ban/         [add]
POST   /admin/sellers/<id>/unban/       [add]
GET    /admin/sellers/<id>/products/    [add]
GET    /admin/notices/                  [add]  phase 5
POST   /admin/notices/                  [add]  phase 5
GET    /admin/notices/<id>/replies/     [add]  phase 5
GET    /admin/audit-logs/               [move]
```

Four named verbs — `approve` / `reject` / `ban` / `unban` — instead of one
`PATCH status=…`. Each has different side effects (approval stamps
`approved_by`, ban stamps `suspended_by` and sends a notice) and each writes a
different `AuditLog.action`. A generic status PATCH would have to branch on the
target value inside the serializer, which is where that logic goes to die.

`/admin/users/` and `/admin/orders/` are dropped from the admin surface: the spec
lists neither, and `toggle-active` is superseded by ban/unban. Keep the code,
unroute it — cheaper to restore than to rewrite.

**Assistant** — `AllowAny`, but explicitly closed to seller and admin.

```
POST   /assistant/ask/                  [change] add role block
GET    /assistant/suggest/              [change]
GET    /assistant/suggestions/          [keep]
GET    /assistant/history/<uuid>/       [keep]
```

A new `core.permissions` class, since "anonymous yes, but two signed-in roles no"
is not expressible with the existing set:

```python
class IsCustomerOrAnonymous(BasePermission):
    """The marketplace-facing audience.

    Anonymous visitors are welcome — the assistant is a shopping aid and
    pre-login browsing is the point. Sellers and admins are refused: the spec
    puts the assistant outside both dashboards, and letting a seller query it
    would hand them a competitor-catalogue search tool.
    """
    message = "The shopping assistant is for customers."

    def has_permission(self, request, view):
        user = request.user
        return not (user and user.is_authenticated) or user.is_customer
```

### 4.3 Root URL conf

```python
# backend/urls.py
API = "api/v1/"
urlpatterns = [
    path("django-admin/", admin.site.urls),          # [change] renamed, see below
    path("health/", health),

    path(API, include("accounts.urls")),             # auth, addresses
    path(API, include("shops.urls")),                # public shops
    path(API, include("products.urls")),             # public catalogue
    path(f"{API}me/", include("cart.urls")),         # customer
    path(f"{API}me/", include("orders.customer_urls")),
    path(f"{API}seller/", include("orders.seller_urls")),
    path(f"{API}seller/", include("shops.seller_urls")),
    path(f"{API}seller/", include("products.seller_urls")),
    path(f"{API}admin/", include("adminpanel.urls")),
    path(API, include("assistant.urls")),
    path(f"{API}me/", include("messaging.customer_urls")),      # phase 5
    path(f"{API}seller/", include("messaging.seller_urls")),    # phase 5
]
```

Two things to call out:

**Django's own admin moves to `/django-admin/`.** It currently sits at `/admin/`,
one segment away from the `/api/v1/admin/` API group, and the React app will own
`/admin` as a client route. Three different "admins" is a trap; rename the one
with the fewest callers.

**Apps split their `urls.py` by audience** (`customer_urls.py`, `seller_urls.py`)
rather than one file with mixed prefixes. The mount point then carries the
prefix, and each file has exactly one default permission class.

---

## 5. Permission matrix

`—` means the role has no route to the resource at all: no client route, no
sidebar entry, and the API returns 403. Not "hidden in the UI".

### 5.1 Marketplace

| Resource | Anonymous | Customer | Seller | Admin |
|---|---|---|---|---|
| Home page | view | view | — | — |
| Product list / search | view | view | — | — |
| Product detail | view | view | own only, via dashboard | read-only, via seller detail |
| Category browse | view | view | — | — |
| Shop directory `/shops` | view | view | — | — |
| Shop detail | view | view | own only, via dashboard | read-only, via seller detail |
| Cart | — | full | — | — |
| Wishlist | — | full | — | — |
| Checkout | — | full | — | — |
| AI assistant | ask | ask | — | — |
| Search suggest | use | use | — | — |

Anonymous gets cart as `—` deliberately: the current `Cart` model is
`OneToOneField(User)`, so there is no guest cart and pretending otherwise in the
matrix would misdescribe the code. Guest carts are a separate feature, not part
of this reorganization.

### 5.2 Orders

| Action | Customer | Seller | Admin |
|---|---|---|---|
| Place order | own | — | — |
| View order list | own | own line items only | — |
| View order detail | own | own line items only | — |
| Cancel order | own, while cancellable | — | — |
| Accept / reject line item | — | own | — |
| Advance fulfilment status | — | own | — |
| Set tracking number | — | own | — |

Seller order access is per `OrderItem`, never per `Order` — an order can span
shops, and seller A must not see seller B's lines or the order total. This is
already how `SellerOrderItemViewSet` works and it is worth preserving explicitly.

### 5.3 Catalogue management

| Action | Customer | Seller | Admin |
|---|---|---|---|
| Create product | — | own shop | — |
| Edit / delete product | — | own shop | — |
| Adjust stock | — | own shop | — |
| Upload product image | — | own shop | — |
| Manage variants | — | own shop | — |
| AI draft listing | — | own shop | — |
| Create / edit category | — | — | Django admin only |
| View any seller's products | — | — | read-only |

Admin cannot create or edit products. The spec gives admin "view seller
products" and nothing more, and an admin who can edit a seller's listing creates
a liability question about who made a product claim.

### 5.4 Shop and seller lifecycle

| Action | Customer | Seller | Admin |
|---|---|---|---|
| Create own shop | — | once, at registration | — |
| Edit own shop | — | own | — |
| Upload logo / banner | — | own | — |
| View pending seller requests | — | — | yes |
| Approve seller | — | — | yes |
| Reject seller | — | — | yes |
| Ban seller | — | — | yes, `APPROVED → SUSPENDED` |
| Unban seller | — | — | yes, `SUSPENDED → APPROVED` |
| View seller list | — | — | yes |
| View audit log | — | — | yes |

A `SUSPENDED` seller keeps: login, the notices page, the reply form, and
read-only access to their own dashboard. They lose: all writes, and their
products drop out of public listings via the existing `is_approved` gate.

### 5.5 Reviews

| Action | Anonymous | Customer | Seller | Admin |
|---|---|---|---|---|
| Read reviews | view | view | own products | — |
| Write review | — | own, verified purchase | — | — |
| Edit / delete own review | — | own | — | — |
| Mark helpful | — | yes | — | — |
| Reply to review | — | — | own products, one reply | — |
| Edit own reply | — | — | own | — |

### 5.6 Messaging (phase 5)

| Action | Customer | Seller | Admin |
|---|---|---|---|
| Start conversation with a shop | yes | — | — |
| Reply in conversation | own threads | own shop's threads | — |
| Send notice to one seller | — | — | yes |
| Send notice to all sellers | — | — | yes |
| Reply to a notice | — | own | — |
| Read notice replies | — | own | yes |

Sellers cannot start a conversation with a customer. Unsolicited seller-initiated
messaging is a spam vector, and the spec phrases it one-directionally: "Receive
customer messages / Reply to customers".

### 5.7 Enforcement layers

Three layers, each with a distinct job. All three are required; none substitutes
for another.

| Layer | Mechanism | Failure mode it prevents |
|---|---|---|
| Route guard | `RequireRole` in the router | Wrong dashboard renders, flashes data, then errors |
| Navigation | Per-role sidebar and layout | User sees a link they cannot use |
| API | DRF `permission_classes` | The only layer that actually secures anything |

The API layer is the real boundary. The other two exist so the app doesn't render
a broken screen before the 403 arrives.

---

## 6. React folder structure

### 6.1 Current shape and why it stops scaling

47 files, with `pages/` flat except for `auth/` and `seller/`. The problems are
concrete rather than stylistic:

- `components/` holds both shared primitives (`ui.jsx`, `icons.jsx`) and
  customer-specific features (`ProductCard`, `SmartSearch`, `ChatWidget`,
  `OrderStatus`). Nothing signals that an admin page must not import
  `ChatWidget`.
- `api/endpoints.js` is one file with eleven exported objects covering all three
  roles. A seller page can autocomplete its way to `adminApi`.
- There is no `admin/` anything.

### 6.2 Target structure

```
src/
  main.jsx
  config.js

  app/
    App.jsx                    # providers + <RouterProvider>
    routes/
      index.jsx                # assembles the three trees
      customerRoutes.jsx
      sellerRoutes.jsx
      adminRoutes.jsx
      guards.jsx               # RequireAuth, RequireRole, RequireAnonymous
    providers.jsx              # QueryClient + Auth + Theme, one place

  api/
    client.js                  # axios + JWT refresh interceptor   [keep]
    tokens.js                  # [keep]
    public.js                  # catalogue, shops, search
    auth.js
    customer.js                # cart, wishlist, orders, addresses, reviews
    seller.js                  # shop, products, orders, reviews, messages
    admin.js                   # sellers, notices, audit log
    assistant.js

  components/                  # shared, role-agnostic, no feature imports
    ui/                        # split from ui.jsx once it passes ~500 lines
    icons.jsx
    ThemeToggle.jsx
    ErrorBoundary.jsx

  layouts/
    CustomerLayout.jsx         # header, footer, SmartSearch, ChatWidget
    SellerLayout.jsx           # sidebar, no cart, no assistant
    AdminLayout.jsx            # sidebar, no marketplace chrome
    AuthLayout.jsx             # from AuthShell.jsx
    Sidebar.jsx                # shared shell, takes an items array

  features/
    catalog/     components/{ProductCard,ProductFilters,CategoryNav}
                 pages/{Home,ProductList,ProductDetail,Categories}
    shops/       components/ShopCard
                 pages/{ShopList,ShopDetail}
    cart/        components/CartLineItem
                 hooks/useCart.js
                 pages/{Cart,Checkout}
    orders/      components/OrderStatus
                 pages/{Orders,OrderDetail}
    wishlist/    pages/Wishlist
    reviews/     components/{ReviewList,ReviewForm,ReviewReply}
    account/     pages/{Profile,Addresses}
    auth/        pages/{Login,Register,ForgotPassword,ResetPassword,VerifyEmail}
    assistant/   components/{ChatWidget,SmartSearch}
    seller/      components/{StatCard,SalesChart}
                 pages/{Dashboard,ShopSettings,Products,ProductForm,
                        Inventory,Orders,Reviews,Messages,Notices}
    admin/       components/{SellerStatusBadge,NoticeComposer}
                 pages/{Dashboard,SellerRequests,SellerList,SellerDetail,
                        SellerProducts,Notices,AuditLog}

  hooks/                       # cross-feature only
    useAuth.js  useTheme.js  useDebounce.js
  lib/
    cn.js  format.js
  index.css
```

### 6.3 The three rules that make it hold

**One import direction.** `features/* → components/* → lib/*`, never sideways
between features and never upward. `features/seller/` importing from
`features/cart/` is the smell that the boundary has broken.

**Feature-scoped API modules.** `features/admin/*` imports `api/admin.js` and
nothing else from `api/`. The split isn't cosmetic — it means a seller page
cannot accidentally call an admin endpoint, and the bundler can code-split the
three role trees cleanly.

**Assistant lives in a feature, not in a layout.** `ChatWidget` and `SmartSearch`
move into `features/assistant/` and are mounted only by `CustomerLayout`. That is
the structural fix for finding 1.2 — an admin cannot see the assistant because
`AdminLayout` has no import path to it, not because a boolean is false.

Worth naming the tradeoff: this is more directories for the same 47 files, and on
a solo project that is real overhead. It pays off precisely because three roles
share one codebase — the structure is what stops customer chrome leaking into the
admin panel.

### 6.4 Migration order

Directory moves break every import at once, so do them one feature at a time and
run `npm run lint:all` between each — `oxlint` catches unresolved imports and
`lint:contrast` catches a layout that lost its token classes.

```
1. app/ + layouts/          extract from App.jsx and Layout.jsx
2. api/ split               endpoints.js -> five modules, keep old file re-exporting
3. features/assistant/      moves ChatWidget + SmartSearch out of the shared layout
4. features/{catalog,cart,orders,wishlist,account,auth,reviews}
5. features/seller/         rename pages/seller/
6. features/{admin,shops}   new
7. delete the endpoints.js shim
```

Step 2's shim matters: `export * from './public'` etc. in the old
`api/endpoints.js` keeps every existing import working while the pages move, and
step 7 deletes it once nothing imports it. Without the shim, step 2 touches all
30-odd page files in one commit.

---

## 7. Role-based routing

### 7.1 Three trees, not one tree with conditionals

```jsx
// app/routes/index.jsx
export const router = createBrowserRouter([
  // ---- public + customer -------------------------------------------------
  {
    element: <CustomerLayout />,
    children: customerRoutes,
    errorElement: <RouteError />,
  },
  // ---- auth: its own chrome, no header or footer -------------------------
  { element: <AuthLayout />, children: authRoutes },

  // ---- seller: nothing from the marketplace shell -----------------------
  {
    path: 'seller',
    element: <RequireRole role="seller"><SellerLayout /></RequireRole>,
    children: sellerRoutes,
  },
  // ---- admin ------------------------------------------------------------
  {
    path: 'admin',
    element: <RequireRole role="admin"><AdminLayout /></RequireRole>,
    children: adminRoutes,
  },

  { path: 'forbidden', element: <Forbidden /> },
  { path: '*', element: <NotFound /> },
])
```

The guard wraps the **layout**, not the children. If it wrapped the children a
seller hitting `/admin` would still render `AdminLayout` — sidebar, header, admin
branding — around a redirect. Guarding the layout means the wrong role never
paints admin chrome at all.

### 7.2 `RequireRole`

```jsx
// app/routes/guards.jsx
const HOME_FOR = { admin: '/admin', seller: '/seller', customer: '/' }

/**
 * Restricts a subtree to one role.
 *
 * Wrong-role users are sent to *their own* home rather than /forbidden. A
 * customer who bookmarked /seller made a navigation mistake, not an attack, and
 * a dead-end error page is a worse answer than their own dashboard. /forbidden
 * stays for the genuine case: an authenticated user whose API call was refused.
 */
export function RequireRole({ role, children }) {
  const { booting, isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (booting) return <FullPageSpinner />
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (user.role !== role) {
    return <Navigate to={HOME_FOR[user.role] ?? '/'} replace />
  }
  return children
}
```

`RequireAuth` stays for customer routes that need a session but no specific role
— except it now takes `role="customer"` on cart, checkout, wishlist and orders,
which is what closes the seller-can-reach-checkout hole in finding 1.3.

### 7.3 Customer routes

```jsx
export const customerRoutes = [
  { index: true,                    element: <Home /> },
  { path: 'products',               element: <ProductList /> },
  { path: 'products/:slug',         element: <ProductDetail /> },
  { path: 'categories',             element: <Categories /> },
  { path: 'shops',                  element: <ShopList /> },        // [add]
  { path: 'shops/:slug',            element: <ShopDetail /> },      // [add]
  { path: 'verify-email',           element: <VerifyEmail /> },

  {
    element: <RequireRole role="customer" />,   // [change] was RequireAuth
    children: [
      { path: 'cart',               element: <Cart /> },
      { path: 'checkout',           element: <Checkout /> },
      { path: 'orders',             element: <Orders /> },
      { path: 'orders/:number',     element: <OrderDetail /> },
      { path: 'wishlist',           element: <Wishlist /> },
      { path: 'messages',           element: <Conversations /> },   // [add] phase 5
      { path: 'account',            element: <Profile /> },
      { path: 'account/addresses',  element: <Addresses /> },
    ],
  },
]
```

`/account` is `role="customer"` too. A seller's profile edit lives at
`/seller/shop`, and an admin has no profile page in this spec — so a single
shared `/account` would need three different layouts, which is the conditional
mess this whole section removes.

### 7.4 Seller routes

```jsx
export const sellerRoutes = [
  { index: true,                 element: <SellerDashboard /> },
  { path: 'shop',                element: <ShopSettings /> },
  { path: 'products',            element: <SellerProducts /> },
  { path: 'products/new',        element: <ProductForm /> },
  { path: 'products/:slug',      element: <ProductForm /> },
  { path: 'inventory',           element: <Inventory /> },
  { path: 'orders',              element: <SellerOrders /> },       // ?status= tabs
  { path: 'reviews',             element: <SellerReviews /> },      // [add]
  { path: 'messages',            element: <SellerMessages /> },     // [add] phase 5
  { path: 'notices',             element: <SellerNotices /> },      // [add] phase 5
]
```

Order tabs are `?status=pending|processing|delivered|cancelled` on one route, not
four routes. The four tabs differ by a query filter and share every other
concern; four routes would duplicate the table, the pagination and the status
mutation four times.

### 7.5 Admin routes

```jsx
export const adminRoutes = [
  { index: true,                    element: <AdminDashboard /> },
  { path: 'sellers',                element: <SellerList /> },       // ?status= tabs
  { path: 'sellers/requests',       element: <SellerRequests /> },   // pending queue
  { path: 'sellers/:id',            element: <SellerDetail /> },
  { path: 'sellers/:id/products',   element: <SellerProducts /> },
  { path: 'notices',                element: <AdminNotices /> },     // phase 5
  { path: 'notices/new',            element: <NoticeComposer /> },   // phase 5
  { path: 'audit-log',              element: <AuditLog /> },
]
```

Nine admin pages, no customer routes reachable from any of them. `/admin/sellers/requests` is a separate route from `/admin/sellers?status=pending` on
purpose — the approval queue is the admin's primary workflow and deserves a
bookmarkable URL and its own empty state, not a filter preset.

### 7.6 Post-login redirect

```jsx
// features/auth/pages/Login.jsx — after a successful login
const HOME_FOR = { admin: '/admin', seller: '/seller', customer: '/' }

// An intended destination only wins if the user's role can actually reach it,
// otherwise a customer who was bounced from /seller would be sent straight back
// into the same redirect on login.
const intended = location.state?.from?.pathname
const home = HOME_FOR[user.role] ?? '/'
const canReach =
  intended &&
  !(user.role !== 'seller' && intended.startsWith('/seller')) &&
  !(user.role !== 'admin' && intended.startsWith('/admin')) &&
  !(user.role !== 'customer' && CUSTOMER_ONLY.test(intended))

navigate(canReach ? intended : home, { replace: true })
```

`RequireAnonymous` also changes: it currently sends signed-in users to `/`, which
drops an admin onto a marketplace page they are not allowed to see. It should
send them to `HOME_FOR[user.role]`.

---

## 8. Sidebars and menus

One `Sidebar.jsx` shell in `layouts/`, three data definitions. Each item carries
the permission that its route enforces, so the sidebar and the guard cannot drift
apart.

### 8.1 Admin

```jsx
export const adminNav = [
  { section: null, items: [
    { to: '/admin',                  label: 'Dashboard',        icon: GridIcon },
  ]},
  { section: 'Sellers', items: [
    { to: '/admin/sellers/requests', label: 'Requests',         icon: InboxIcon,
      badge: 'pendingSellerCount' },
    { to: '/admin/sellers',          label: 'All sellers',      icon: StoreIcon },
  ]},
  { section: 'Communication', items: [
    { to: '/admin/notices',          label: 'Notices',          icon: MegaphoneIcon },
  ]},
  { section: 'System', items: [
    { to: '/admin/audit-log',        label: 'Audit log',        icon: ListIcon },
  ]},
]
```

Four groups, six links. No search bar, no cart, no theme-toggle-plus-marketplace
header — `AdminLayout`'s top bar holds the page title, the pending-requests count
and the account menu, nothing else.

The `badge: 'pendingSellerCount'` key names a field on the `/admin/dashboard/`
response rather than embedding a fetch in the nav definition. The layout fetches
once and the sidebar reads from it.

### 8.2 Seller

```jsx
export const sellerNav = [
  { section: null, items: [
    { to: '/seller',            label: 'Dashboard',  icon: GridIcon },
  ]},
  { section: 'Shop', items: [
    { to: '/seller/shop',       label: 'Shop profile', icon: StoreIcon },
    { to: '/seller/products',   label: 'Products',     icon: BoxIcon },
    { to: '/seller/inventory',  label: 'Inventory',    icon: LayersIcon,
      badge: 'lowStockCount' },
  ]},
  { section: 'Sales', items: [
    { to: '/seller/orders',     label: 'Orders',       icon: ReceiptIcon,
      badge: 'pendingOrderCount' },
    { to: '/seller/reviews',    label: 'Reviews',      icon: StarIcon },
  ]},
  { section: 'Inbox', items: [
    { to: '/seller/messages',   label: 'Messages',     icon: ChatIcon,
      badge: 'unreadMessageCount' },
    { to: '/seller/notices',    label: 'Admin notices', icon: MegaphoneIcon,
      badge: 'unreadNoticeCount' },
  ]},
]
```

A suspended seller sees the same sidebar with everything except Dashboard and
Admin notices disabled, plus a persistent banner carrying
`suspension_reason`. Hiding the links would leave them wondering what happened;
disabling them with a reason is the honest version.

### 8.3 Customer — header, not sidebar

Customers keep the existing horizontal header. A sidebar on a storefront wastes
the width that product grids need.

```jsx
export const customerNav = {
  primary: [                          // always visible in the header
    { to: '/products',   label: 'Products' },
    { to: '/categories', label: 'Categories' },
    { to: '/shops',      label: 'Shops' },      // [add]
  ],
  actions: [                          // icon rail, right side
    { component: 'SmartSearch' },
    { to: '/wishlist', icon: HeartIcon, badge: 'wishlistCount' },
    { to: '/cart',     icon: CartIcon,  badge: 'cartCount' },
    { component: 'ThemeToggle' },
  ],
  account: [                          // dropdown, authenticated only
    { to: '/account',           label: 'Profile' },
    { to: '/orders',            label: 'My orders' },
    { to: '/account/addresses', label: 'Addresses' },
    { to: '/messages',          label: 'Messages', badge: 'unreadMessageCount' },
  ],
}
```

The current account dropdown appends "Seller dashboard" and "Admin" links
conditionally (`Layout.jsx:52-53`, `:302-303`). Those come out — with separate
trees there is no signed-in seller or admin looking at the customer header to
begin with.

---

## 9. Navigation flow

### 9.1 Login

```
                          ┌─────────────┐
   POST /auth/login/ ───► │ user.role ? │
                          └──────┬──────┘
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
          admin               seller              customer
             │                   │                   │
             ▼                   ▼                   ▼
        /admin              status ?              intended
      (Dashboard)               │                 route or /
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                pending    approved     suspended
                    │           │           │
                    ▼           ▼           ▼
             /seller with   /seller     /seller with
             "awaiting      (full)      suspension
              approval"                  banner,
              banner,                    writes off
              writes off
```

All three seller states land on `/seller`. The alternative — routing pending and
suspended sellers to dedicated pages — means three entry points to maintain and a
seller who cannot see their own dashboard while they wait.

### 9.2 Customer purchase flow

```
/ ──► /products ──► /products/:slug ──► add to cart ──► /cart
                          │                                │
                          ├──► /shops/:slug (shop page)     ▼
                          │                            /checkout
                          └──► ask assistant                │
                                                            ▼
                                                    POST /me/checkout/
                                                            │
                                                            ▼
                                                  /orders/:number
                                                  (tracking timeline)
```

Unauthenticated add-to-cart redirects to `/login` with `state.from` set to the
product page, so login returns them to the product rather than the home page.

### 9.3 Seller approval flow

```
Register as seller ──► SellerProfile(status=pending) ──► /seller
                                    │                     (banner: awaiting review)
                                    ▼
                    Admin: /admin/sellers/requests
                                    │
                       ┌────────────┴────────────┐
                       ▼                         ▼
              POST …/<id>/approve/       POST …/<id>/reject/
                       │                         │
          status=approved                status=rejected
          approved_at, approved_by       rejection_reason
          AuditLog(action=approve)       AuditLog(action=reject)
          notice to seller               notice to seller
                       │                         │
                       ▼                         ▼
              seller can now write     /seller shows reason,
                                       writes stay off
```

### 9.4 Ban flow

```
Admin: /admin/sellers/:id ──► POST …/<id>/ban/  { reason }
                                       │
                                       ▼
                    services.suspend_seller() — one transaction:
                      status = SUSPENDED
                      suspended_at, suspended_by, suspension_reason
                      AuditLog(action=ban, changes={...})
                      AdminNotice + NoticeRecipient   (phase 5)
                                       │
                                       ▼
        Seller can still log in ──► /seller ──► banner with reason
                                       │        ──► /seller/notices ──► reply
                                       ▼
                            IsApprovedSeller now fails
                            ──► every write returns 403
                            ──► products drop out of public listings
```

Unban is the same transaction in reverse, clearing the three suspension fields
and writing `AuditLog(action=unban)`.

### 9.5 Where each role cannot go

```
customer ──► /seller  or /admin   ──► redirect to /
seller   ──► /  /cart  /wishlist  ──► redirect to /seller
         ──► /admin                ──► redirect to /seller
admin    ──► /  /products /cart    ──► redirect to /admin
         ──► /seller                ──► redirect to /admin
```

Redirect to the role's own home, not `/forbidden`. `/forbidden` is reserved for a
403 from the API — the case where the route was legitimate but the specific object
was not the user's.

---

## 10. Phase plan

Ordered so each phase leaves the app working and nothing depends on a later one.

| # | Phase | Contents | Risk |
|---|---|---|---|
| 1 | Role separation | Three layouts, three route trees, `RequireRole`, assistant into `features/`, post-login redirect | Low — frontend only, no schema |
| 2 | Backend enforcement | `IsCustomer` on cart/wishlist/checkout/orders, `IsCustomerOrAnonymous` on assistant | Low, but **it is the security fix** — do it early |
| 3 | Admin panel | `adminpanel` app, approve/reject/ban/unban + services, seller list/detail/products, audit log, dashboard, seven React pages | Medium — most new code |
| 4 | Shops + reviews | `shops` app, storefront fields migration, tagline data migration, `/shops` pages, `ReviewReply` | Medium — one data migration |
| 5 | Messaging | `messaging` app, conversations, notices, three inbox UIs | Medium |
| 6 | API path cleanup | `/me/` prefix, `/seller/` consolidation, delete the `endpoints.js` shim, `/django-admin/` | Low but touches everything — last on purpose |

Phase 2 is the one that actually matters for correctness and is nearly free —
it's roughly six `permission_classes` lines plus one new class. Phase 1 makes the
app *look* right; phase 2 makes it *be* right. If you only do two phases, do
those two.

### 10.1 What is deliberately not here

- Multi-shop sellers, guest carts, coupons, payment gateway integration,
  real-time websockets, notification fan-out beyond the notice table.
- Splitting `products` into `catalog` + `reviews`, or `SellerProfile` into
  `Shop` — both are table renames with no capability payoff today. Section 0.
- Microservices, event buses, CQRS, a separate read model. The whole app is one
  Postgres database and should stay that way.

### 10.2 Verification per phase

The project has three checks and they should gate every phase:

```bash
cd Backend && python manage.py test          # per-app tests
cd Frontend/vite-project && npm run lint:all # oxlint + contrast + contrast tests
```

Two additions worth making as the phases land:

- **A permission matrix test.** Section 5 is a table of assertions; turn it into
  a parametrised test that logs in as each role and asserts the expected status
  code per endpoint. That is the artefact that keeps the matrix honest, and it
  is the single most portfolio-legible test in the project.
- **A route-reachability test.** For each role, assert that navigating to every
  other role's routes redirects rather than renders.
