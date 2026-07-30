# CommerceX — Backend (Phase 1)

Enterprise multi-vendor e-commerce API. Django 5 + DRF + PostgreSQL + JWT.

## What's in Phase 1

| App | Contents |
|---|---|
| `core` | Abstract models (UUID PK, timestamps, soft delete), RBAC permission classes, pagination |
| `accounts` | Custom email-login `User` with roles, customer/seller profiles, address book, JWT auth, seller approval workflow, audit log |
| `products` | Nested categories, products, images, variants, reviews, full-text search, filters, atomic stock control |
| `cart` | Cart, cart items with price snapshots, wishlist, stock-safe add/update |
| `assistant` | AI shopping assistant: deterministic catalogue retrieval + grounded LLM answers, persisted conversations |
| `orders` | Checkout with locked stock deduction, snapshotted order lines, per-seller fulfilment, tracking timeline |
| `core.ai` | Groq client with caching, token caps and graceful degradation |

## Configuration

Everything environment-specific lives in `.env` — 61 keys, grouped by concern.
`settings.py` only reads and types them; no secret, URL, rate limit, TTL or
token cap is hardcoded. Secrets use `env_required`, so a missing `SECRET_KEY`,
`DB_NAME` or `DB_USER` is a loud startup crash rather than a silent fallback to
a wrong value.

| Group | Keys |
|---|---|
| Core | `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, `TIME_ZONE`, `LOG_LEVEL`, `LANGUAGE_CODE` |
| Database | `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_CONN_MAX_AGE` |
| JWT | `JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS`, `JWT_ROTATE_REFRESH`, `JWT_BLACKLIST_AFTER_ROTATION` |
| Origins | `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS` |
| Email | `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`, `EMAIL_TIMEOUT`, `DEFAULT_FROM_EMAIL` |
| Email tokens | `VERIFY_TOKEN_TTL_HOURS`, `RESET_TOKEN_TTL_HOURS` |
| AI | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_TIMEOUT`, `GROQ_MAX_TOKENS`, `AI_DESCRIPTION_MAX_TOKENS`, `AI_SUMMARY_MAX_TOKENS`, `AI_SUMMARY_MAX_REVIEWS`, `AI_SUMMARY_COMMENT_CHARS`, `AI_DESCRIPTION_CACHE_TTL`, `AI_SUMMARY_CACHE_TTL` |
| Rate limits | `THROTTLE_ANON`, `THROTTLE_USER`, `THROTTLE_EMAIL`, `THROTTLE_AI` |
| API / files | `PAGE_SIZE`, `MAX_PAGE_SIZE`, `MAX_UPLOAD_MB`, `STATIC_URL`, `STATIC_DIR`, `MEDIA_URL`, `MEDIA_DIR` |
| Marketplace | `DEFAULT_COMMISSION_RATE`, `DEFAULT_COUNTRY`, `CURRENCY` |
| Cache | `CACHE_BACKEND`, `CACHE_LOCATION`, `CACHE_TIMEOUT` |
| Production | `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS` (applied only when `DEBUG=False`) |

Frontend config is `Frontend/vite-project/.env`. Only `VITE_*` keys reach the
browser, and everything there ends up readable in the JS bundle — which is
exactly why the Groq key stays on the Django side and AI calls are proxied
through our own API.

Both `.env` files are gitignored; `.env.example` is tracked.

## Setup

**The database is `commercex`.** That name appears in exactly one place —
`DB_NAME` in `.env` — and everything else reads it from there. Never type a
different name.

### One command

```bash
cd Backend && ./setup.sh
```

Creates the venv, installs dependencies, repairs `.env` without overwriting it,
starts Postgres, syncs the role password, creates the database, runs migrations
and seeds demo data. Safe to run repeatedly — it skips anything already done and
stops at the first real error with a specific fix rather than cascading.

> ⚠️ **Never run `cp .env.example .env` by hand.** `.env` holds your real
> `SECRET_KEY` and `DB_PASSWORD`; copying over it blanks both and Django refuses
> to start. `setup.sh` handles this correctly.

### Or step by step

Everyday startup — safe to paste as-is:

```bash
cd Backend
source venv/bin/activate

python manage.py makemigrations accounts products cart orders
python manage.py migrate
python manage.py runserver
```

First time only:

```bash
cd Backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

createdb commercex

python manage.py makemigrations accounts products cart orders
python manage.py migrate
python manage.py seed_demo         
python manage.py runserver
```

Inside an active venv use `python`, not `python3` — on macOS `python3` can
resolve back to the Homebrew install outside the venv.

**Confirm which database you're on before debugging anything:**

```bash
python manage.py shell -c "from django.db import connection; print(connection.settings_dict['NAME'])"
# must print: commercex
```

If that prints something else, `.env` is missing or has the wrong `DB_NAME` —
fix it there, not in `settings.py`.

Starting completely fresh (there's no data worth keeping in development):

```bash
psql postgres -c "DROP DATABASE IF EXISTS commercex WITH (FORCE);"
psql postgres -c "CREATE DATABASE commercex;"
python manage.py migrate && python manage.py seed_demo
```

### Recovering a lost `.env`

Only if `Backend/.env` does not exist. This generates a fresh `SECRET_KEY`
rather than leaving it blank:

```bash
cd Backend
cp .env.example .env
python - <<'EOF'
import pathlib, re
from django.core.management.utils import get_random_secret_key
p = pathlib.Path('.env')
t = p.read_text()
t = re.sub(r'^SECRET_KEY=.*$', f'SECRET_KEY=django-insecure-{get_random_secret_key()}', t, flags=re.M)
t = re.sub(r'^DB_PASSWORD=.*$', 'DB_PASSWORD=admin123', t, flags=re.M)
p.write_text(t)
print('.env restored')
EOF
```

Then confirm both are set before doing anything else:

```bash
grep -E '^(SECRET_KEY|DB_NAME|DB_PASSWORD)=' .env
```

## Docs

- Swagger UI — http://127.0.0.1:8000/api/docs/
- ReDoc — http://127.0.0.1:8000/api/redoc/
- OpenAPI schema — http://127.0.0.1:8000/api/schema/
- Django admin — http://127.0.0.1:8000/admin/

## API surface

### Auth (`/api/v1/auth/`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `register/` | public | Create a customer or seller; returns tokens |
| POST | `login/` | public | JWT access + refresh (role embedded in claims) |
| POST | `refresh/` | public | Rotate access token |
| POST | `logout/` | auth | Blacklist a refresh token |
| GET/PATCH | `me/` | auth | Current user |
| POST | `change-password/` | auth | Change password |

### Profile (`/api/v1/`)

`profile/customer/`, `profile/seller/`, `addresses/` (full CRUD, default-address handling).

### Catalogue (`/api/v1/`)

| Method | Path | Access |
|---|---|---|
| GET | `categories/`, `categories/tree/` | public |
| POST/PATCH/DELETE | `categories/` | admin |
| GET | `products/`, `products/{slug}/` | public |
| POST | `products/` | approved seller |
| PATCH/DELETE | `products/{slug}/` | owning seller or admin |
| POST | `products/{slug}/adjust-stock/` | owning seller |
| GET | `products/low-stock/` | seller |
| GET | `products/{slug}/reviews/` | public |
| CRUD | `product-images/`, `product-variants/` | approved seller |
| CRUD | `reviews/` | auth (one per product) |

### Cart & wishlist (`/api/v1/`)

| Method | Path | Purpose |
|---|---|---|
| GET / DELETE | `cart/` | Retrieve or empty the cart |
| POST | `cart/items/` | Add an item (merges with an existing line) |
| PATCH / DELETE | `cart/items/{id}/` | Change quantity or remove |
| POST | `cart/items/{id}/resync-price/` | Accept a changed price |
| GET / POST / DELETE | `wishlist/` | Saved products |
| POST | `wishlist/toggle/` | Add or remove in one call |
| POST | `wishlist/{id}/move-to-cart/` | Move a saved item into the cart |

Every cart mutation returns the **whole cart**, so the client never has to
reconcile partial state.

### Email verification & password reset (`/api/v1/auth/`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `send-verification/` | auth | Resend the verification email (5/hour) |
| POST | `verify-email/` | public | Confirm an address with a token |
| POST | `forgot-password/` | public | Request a reset link (5/hour) |
| POST | `reset-password/` | public | Set a new password, revoking all sessions |

Tokens are stored only as SHA-256 hashes, are single-use, and are scoped by
purpose — a verification token can't be replayed as a password reset. Verify
links last 48 hours, reset links 1 hour. `forgot-password/` returns an identical
response for known and unknown addresses so it can't be used to enumerate
accounts.

**Email setup.** Leave `EMAIL_HOST_USER` blank and mail prints to the console —
local development needs no SMTP at all. To send real mail, use a Gmail
**App Password** (Google Account → Security → 2-Step Verification → App
passwords), not your account password:

```
EMAIL_HOST_USER=you@gmail.com
EMAIL_HOST_PASSWORD=xxxxxxxxxxxxxxxx
```

### AI (`/api/v1/`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `assistant/ask/` | public | Shopping assistant, grounded in the catalogue |
| GET | `assistant/suggest/` | public | Instant search suggestions (no LLM) |
| GET | `assistant/suggestions/` | public | Opening prompts + whether AI is on |
| GET | `assistant/history/{session}/` | owner | Replay a conversation |
| GET | `assistant/sessions/` | auth | My conversations |
| POST | `ai/draft-listing/` | approved seller | SEO title + description + bullets + meta |
| GET | `products/{slug}/ai-summary/` | public | Review digest, cached 6h |

Set `GROQ_API_KEY` to enable. With it unset, `AI_ENABLED` is `False` and every
AI surface degrades rather than erroring — see below.

#### 1. Shopping assistant — how it's grounded

The naive design hands the product table to the model and lets it pick. That
hallucinates prices, recommends out-of-stock items, and costs tokens
proportional to catalogue size — so it breaks exactly when the project stops
being a toy.

This is a two-stage pipeline, and **stage one uses no LLM at all**:

1. **Deterministic retrieval** (`assistant/retrieval.py`). Plain Python parses
   price constraints (`under $1000`, `between 200 and 500`, `cheaper than 300`)
   and sort intent (`cheapest`, `best rated`, `newest`); category names are
   matched against rows that actually exist, longest-name-first, so a category
   can never be invented. PostgreSQL full-text search ranks the rest, with a
   substring fallback for partial words. In-stock items are ranked first.
   This stage is free, deterministic and unit-tested.
2. **Grounded answering** (`assistant/services.py`). The shortlist is rendered
   as one dense line per product — numbered, so the model cites `[2]` rather
   than repeating names — and the system prompt forbids recommending anything
   outside it. Only products the model actually cited are returned, and they are
   **re-read from the database**, so the price and stock a shopper sees are
   always live rather than whatever was in the prompt.

Conversations persist for guests too (client-generated session UUID), and a
guest session is adopted by the account when that visitor signs in. Each stored
assistant message keeps its `retrieval_meta` — the parsed filters, strategy used
and candidate count — which is what makes "why was this recommended?" answerable
after the fact.

**Degradation is a feature, not a fallback.** If the key is missing or Groq is
down, `ask/` still runs stage one and returns real search results with
`ai: false`. The customer gets products either way.

#### 2. AI search bar

`assistant/suggest/` powers the header search. It reuses the **same parser** as
the assistant — price ranges, sort intent, category matching — but makes **no LLM
call**, which is what lets it run on every keystroke for free.

The parsed filters come back as `understood` and the UI renders them as chips,
so the interpretation is visible rather than implied: typing
*"laptop under $1000"* shows `Laptops` and `Max 1000` before you press Enter.
The dropdown also offers category jumps, and the last row hands the identical
query to `assistant/ask/` when the shopper wants prose instead of a list.

On the results page, a query that reads as a question (four or more words, or
containing *under / best / gift / suggest / ?*) also gets a grounded AI answer
card above the grid. A one-word search like "laptop" skips it — calling the model
for that would be pure cost.

#### 3. Seller listing generator

`ai/draft-listing/` returns `seo_title`, `description`, `bullets[]` and
`meta_description` from **one** model call — the product facts are sent once
instead of four times, which is the main cost saving. Output is requested as
JSON and parsed defensively (fences stripped, outermost braces extracted, types
coerced), because models wrap JSON in prose even when told not to. The seller
applies each field individually; nothing is saved until they press Save.

**Token economy** (`core/ai.py`) — `max_completion_tokens` is set per call (320
assistant, 260 listing, 180 summary) instead of the 2048 default;
`reasoning_effort="low"` avoids paying for hidden reasoning on short writing
tasks; chat history is capped at 4 turns so a long conversation can't grow
unboundedly; review summaries cap input at 25 reviews × 180 chars; and identical
inputs are cache-served, so a popular product's summary is generated once every
6 hours regardless of traffic. Every limit is a `.env` key.

### Orders (`/api/v1/`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `checkout/` | auth | Cart → order, deducts stock, empties cart |
| GET | `orders/` | auth | My order history (filter by `status`, search `q`) |
| GET | `orders/{number}/` | owner | Detail with items and tracking timeline |
| POST | `orders/{number}/cancel/` | owner | Cancel and restore stock (before packing) |
| GET | `seller/order-items/` | seller | Only lines for my products |
| POST | `seller/order-items/{id}/status/` | seller | Advance fulfilment, attach tracking |
| GET | `seller/order-items/summary/` | seller | Counts by status, revenue |
| GET | `admin/orders/` | admin | Monitor all orders |
| POST | `admin/orders/{number}/mark-paid/` | admin | Record payment |
| GET | `admin/orders/stats/` | admin | Revenue and volume overview |

Four decisions worth defending in an interview:

- **Checkout locks before it checks.** Every product row is `select_for_update`'d,
  ordered by primary key, *before* stock is validated. Lock ordering is what stops
  two concurrent checkouts deadlocking; the lock itself is what stops them both
  selling the last unit. The whole thing is one transaction, so a single bad line
  commits nothing.
- **Order lines are snapshots.** Name, SKU, price, seller and image are copied at
  purchase time, and `product` is `SET_NULL` rather than `CASCADE`. Renaming,
  repricing or deleting a product cannot rewrite history or destroy an order.
- **The shipping address is copied, not referenced.** Editing a saved address
  must never change where a past order was delivered.
- **Fulfilment is per line, not per order.** A multi-vendor cart makes one order
  containing several sellers' items; each seller ships independently, so each
  line carries its own status and the order reports the least-advanced one.
  Transitions are validated against an explicit state machine — `pending →
  delivered` is a 400, not a silently corrupted order.

Stock is returned exactly once via a `stock_released` flag, so a double-cancel
cannot mint free inventory.

### Admin (`/api/v1/admin/`)

`users/` (+ `toggle_active`), `sellers/` (+ `review` to approve/reject/suspend), `audit-logs/`.

### Query parameters on `products/`

```
?q=wireless earbuds       full-text search (PostgreSQL SearchVector + rank)
&category=electronics     slug; includes all descendant categories
&min_price=10&max_price=500
&in_stock=true&on_sale=true&rating_gte=4
&ordering=-avg_rating     price | -price | created_at | view_count | name
&page=2&page_size=40
```

## Engineering notes

- **RBAC** — role lives on the user and inside the JWT; permission classes in `core/permissions.py` gate every write. Sellers additionally need approval before they can publish.
- **Soft delete** — `SoftDeleteModel` sets `deleted_at`; the default manager hides those rows, `all_objects` exposes them. Nothing is lost, and slugs stay unique against deleted rows.
- **Inventory consistency** — stock changes go through `select_for_update()` inside a transaction and refuse to go negative. Adding to cart takes the same row lock, so two browser tabs can't both slip past the stock check.
- **Price snapshots** — `CartItem.unit_price` is captured at add time. If the seller changes the price mid-session the cart surfaces it as an issue rather than silently altering the total, and the customer explicitly accepts the new price.
- **Audit log** — privileged actions (register, login, approvals, product changes) append to an immutable `AuditLog`, readable only by admins.
- **UUID primary keys** on public-facing models so row counts aren't leaked.
- **N+1 avoidance** — `select_related` / `prefetch_related` plus aggregate annotations for ratings.
- **OpenAPI** — every endpoint is tagged and documented via drf-spectacular.

## Tests

```bash
python3 manage.py test
```

Covers registration validation, JWT claims, RBAC denial paths, catalogue visibility,
cross-seller write protection, price filtering, negative-stock rejection,
soft delete behaviour, and the one-review-per-product constraint.

## Product images

`seed_demo` generates images with Pillow rather than fetching stock photos, so
setup works offline, in CI, with no key and no rate limit — and it exercises the
real `ImageField → MEDIA_ROOT → /media/` pipeline, which is the part that
actually has bugs. Hot-linking a CDN tests nothing.

Each image is deterministic (colour and glyph derive from a hash of the product
name, so re-seeding never reshuffles the catalogue's appearance) and
category-aware — laptops get a laptop outline, audio gets headphones, books get
an open book, and so on, over a soft gradient with a caption band.

Products created before image generation existed won't have any. Backfill them
without dropping the catalogue:

```bash
python manage.py backfill_images              # only products with no images
python manage.py backfill_images --replace    # regenerate everything
python manage.py backfill_images --per 3      # 3-image gallery each
```

## Next phases

4. Admin dashboard UI, coupons / discount engine
5. Payments (sandbox), invoice PDFs, return/refund workflow
6. Analytics dashboards, recommendations, CSV import/export, notifications
7. Docker + deployment
