Live Demo: [https://multi-vendor-marketplace-224q-2u2tblaom.vercel.app](https://multi-vendor-marketplace-224q.vercel.app)
# CommerceX — Backend (Phase 1)

**Enterprise multi‑vendor e‑commerce API** built with Django 5, DRF, PostgreSQL, and JWT.  
Phase 1 delivers the core platform: accounts, catalogue, cart, AI assistant, orders, and admin.

---

## 🚀 Overview

CommerceX is designed for scale and maintainability.  
It follows a modular app structure, applies **RBAC** at every endpoint, uses **UUID primary keys**, and implements **soft delete** across all core models.

The AI shopping assistant is **grounded in your actual catalogue** – it never hallucinates products or prices.  
All sensitive configuration is injected via `.env` – no hardcoded secrets, no accidental leak.

---

## ✨ Features

### 👤 Accounts & Authentication
- Custom `User` model with **email‑based login** (no username).
- Roles: **Customer**, **Seller**, **Admin** – with fine‑grained permissions.
- **JWT authentication** (access + refresh tokens) with role embedded in claims.
- Seller **approval workflow** – sellers must be approved before publishing.
- **Address book** (CRUD, default address management).
- **Email verification** and **password reset** – tokens stored as SHA‑256 hashes, single‑use, time‑bound.
- **Audit log** for privileged actions (login, approvals, product changes).

### 🏷️ Product Catalogue
- **Nested categories** – infinite depth, slug‑based.
- **Products** with full‑text search (PostgreSQL `SearchVector`), filters (price, stock, rating, category), and ordering.
- **Product images** – deterministic generation via Pillow, category‑aware.
- **Variants** (SKU, price, stock, attributes).
- **Reviews & ratings** – one review per user per product, aggregate rating cached.
- **Atomic stock control** – uses `select_for_update()` to prevent overselling.
- **Low‑stock alerts** for sellers.

### 🛒 Cart & Wishlist
- **Cart** with price snapshots – if the seller changes the price, the cart highlights the change; customer must accept.
- **Cart items** are merged on re‑add.
- **Wishlist** – save products, toggle, move to cart.
- Every mutation returns the **full cart** – no client‑side reconciliation.

### 🤖 AI Shopping Assistant
- **Two‑stage, grounded pipeline**:
  1. **Deterministic retrieval** – parses price ranges, sort intent, category matches, and full‑text search – all free, no LLM.
  2. **Grounded answering** – LLM (Groq) answers using only the retrieved products; citations `[1]` link to live product data.
- **Search bar suggestions** – uses the same parser, no LLM call, runs on every keystroke.
- **Seller listing generator** – `ai/draft-listing/` produces SEO title, description, bullets, and meta from a single model call.
- **Review summaries** – cached digest of product reviews.
- **Graceful degradation** – if Groq is down or key missing, the assistant still returns real search results (`ai: false`).

### 📦 Orders & Fulfillment
- **Checkout** – locks stock (atomic, deadlock‑safe), snapshots order lines (name, SKU, price, seller, image), clears cart.
- **Per‑line fulfilment** – each seller’s items have their own status; order status reflects the least‑advanced line.
- **State machine** – valid transitions only; prevents invalid status changes.
- **Tracking timeline** – add tracking numbers and status updates per line.
- **Cancellation** – restores stock only once (guarded by a `stock_released` flag).
- **Admin dashboard** – view all orders, mark paid, view stats.

### 🔐 Admin & Monitoring
- **Admin endpoints** – manage users, sellers, audit logs.
- **Audit log** – immutable record of privileged actions.
- **Soft delete** – all models have `deleted_at`; default manager hides deleted rows, but they are never lost.

---

## 🛠️ Tech Stack

- **Backend:** Django 5, Django REST Framework
- **Database:** PostgreSQL (with full‑text search, row‑level locking)
- **Authentication:** JWT (via `djangorestframework-simplejwt`)
- **AI:** Groq (LLM), with caching and token caps
- **Caching:** Redis / Django cache (configurable)
- **Docs:** drf‑spectacular (Swagger, ReDoc, OpenAPI)
- **Testing:** Django test framework

## ⚙️ Setup

### One‑command install (recommended)

```bash
cd Backend && ./setup.sh
```
This creates a venv, installs dependencies, sets up .env (without overwriting existing), starts Postgres, creates the database, runs migrations, and seeds demo data.
Run it any time – it skips already‑completed steps.

Manual setup
```
cd Backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py runserver
```
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 55 20 PM" src="https://github.com/user-attachments/assets/892e684f-024b-482e-b40a-0916b6037a73" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 55 37 PM" src="https://github.com/user-attachments/assets/2641526d-491c-4694-a3c3-188afa7772c3" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 56 12 PM" src="https://github.com/user-attachments/assets/006e9381-3fb6-4468-9f1a-b4292c0cb98a" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 56 19 PM" src="https://github.com/user-attachments/assets/a6cb968c-8c48-49ff-96fe-c214aa657af5" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 56 50 PM" src="https://github.com/user-attachments/assets/8a7f1cf6-d03e-4441-ba71-e1cb7064bd61" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 56 58 PM" src="https://github.com/user-attachments/assets/a91401dc-7e4f-4e96-bca8-e340f4d9628e" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 55 10 PM" src="https://github.com/user-attachments/assets/6f476927-7d65-4bba-88ad-6bcc720463d6" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 55 01 PM" src="https://github.com/user-attachments/assets/def54f05-4df8-4c96-9af6-fb498477cc31" />
<img width="1437" height="820" alt="Screenshot 2026-07-30 at 8 54 53 PM" src="https://github.com/user-attachments/assets/bd2a7abe-0255-4725-8046-c30422f84a5c" />
