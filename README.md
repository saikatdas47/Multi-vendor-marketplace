# CommerceX Multi-Vendor Marketplace

CommerceX is a production-style multi-vendor marketplace built with React, Node.js, Express, PostgreSQL, Redis, Socket.IO and Cloudinary. It separates customer, seller and admin responsibilities while keeping inventory and order updates transactional.

## Architecture

```mermaid
flowchart LR
  UI[React and Vite] --> API[Express API]
  UI <-->|real-time messages| WS[Socket.IO]
  API --> CACHE[(Redis cache)]
  API --> DB[(PostgreSQL)]
  API --> MEDIA[Cloudinary]
  API --> AI[Groq assistant]
  WS --> DB
```

Redis uses cache-aside for catalogue, category and shop reads. PostgreSQL remains the source of truth. If Redis is unavailable, requests continue through PostgreSQL and the API reports `redis: fallback`.

## Database model

```mermaid
erDiagram
  USERS ||--o| CUSTOMER_PROFILES : has
  USERS ||--o| SELLER_PROFILES : owns
  SELLER_PROFILES ||--o{ PRODUCTS : lists
  CATEGORIES ||--o{ PRODUCTS : groups
  PRODUCTS ||--o{ PRODUCT_IMAGES : has
  PRODUCTS ||--o{ PRODUCT_VARIANTS : offers
  PRODUCTS ||--o{ REVIEWS : receives
  USERS ||--o{ ORDERS : places
  ORDERS ||--o{ ORDER_ITEMS : contains
  SELLER_PROFILES ||--o{ ORDER_ITEMS : fulfils
  ORDERS ||--o{ ORDER_EVENTS : records
  SELLER_PROFILES ||--|| CONVERSATIONS : has
  CONVERSATIONS ||--o{ MESSAGES : contains
```

## Role feature matrix

| Capability | Customer | Seller | Admin |
|---|:---:|:---:|:---:|
| Browse, search and review products | Yes | Yes | Yes |
| Cart, checkout and order cancellation | Yes | No | No |
| Product and inventory management | No | Own shop | Oversight |
| Order fulfilment and tracking | No | Own order items | Oversight |
| Shop profile and Cloudinary media | No | Own shop | Review |
| Real-time marketplace messaging | No | Own conversation | All sellers |
| Seller approval, notices and billing | No | View | Manage |

Backend role middleware enforces these boundaries. Hiding frontend navigation is not treated as authorization.

## Order lifecycle

```mermaid
stateDiagram-v2
  pending --> confirmed
  confirmed --> packed
  packed --> shipped
  shipped --> out_for_delivery
  out_for_delivery --> delivered
  delivered --> completed
  delivered --> refunded
  pending --> cancelled
  confirmed --> cancelled
  packed --> cancelled
```

Every transition creates an `order_events` timeline entry. Seller queries include the authenticated seller profile, preventing one seller from updating another seller's order item. Tracking numbers are stored with fulfilment updates. Customer cancellation is limited to cancellable states and returns stock.

## API and cache flow

```mermaid
sequenceDiagram
  participant C as Client
  participant A as Express API
  participant R as Redis
  participant P as PostgreSQL
  C->>A: GET /api/v1/products/
  A->>R: Read cache key
  alt cache hit
    R-->>A: Cached catalogue
  else cache miss or Redis unavailable
    A->>P: Catalogue query
    P-->>A: Products
    A->>R: Store with TTL
  end
  A-->>C: JSON and X-Cache header
```

## One-command Docker setup

Copy `backend/.env.example` to `backend/.env`, add optional Cloudinary, email and Groq credentials, then run:

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend and bundled SPA: `http://localhost:8000`
- Health: `http://localhost:8000/health/`
- Readiness: `http://localhost:8000/ready/`
- Swagger UI: `http://localhost:8000/api/docs`

PostgreSQL initializes from `backend/scripts/schema.sql`. The backend seeds only when the database is empty.

## Local setup

```bash
cd backend
npm install
npm run db:migrate
npm run seed
npm start
```

For an intentionally clean database, `db:reset` is destructive and requires `ALLOW_DATABASE_RESET=YES`.

```bash
cd frontend
npm install
npm run dev
```

## Automated tests

```bash
cd backend
npm test
npm run test:coverage
npm run test:integration
```

The live integration suite verifies all three auth roles, seller/admin authorization and Socket.IO delivery. It requires a running seeded API and is opt-in to avoid accidental external database mutations.

```bash
cd frontend
npm run test:e2e:list
npm run test:e2e
```

Playwright covers Customer → Cart → Checkout and Seller → Order management. Failure traces, screenshots and an HTML report are enabled.

## API documentation and migrations

Interactive Swagger documentation is available at `/api/docs`; the OpenAPI document is served from `/api/docs/openapi.json`.

Database changes are stored in `backend/migrations` and applied in filename order with checksums and a PostgreSQL advisory lock. Render and Docker apply pending migrations before seeding or starting the API. Never edit an already-applied migration; add the next numbered SQL file instead.

## Deploy to Render

The root `render.yaml` deploys one Node web service plus Render Key Value. The
React production build is copied into Express, so the storefront, API and
Socket.IO share one HTTPS origin.

1. Push this repository to GitHub or GitLab.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml`. Enter these prompted secret values:
   - `DATABASE_URL`: the existing Neon PostgreSQL connection string
   - `CLOUDINARY_URL`: `cloudinary://api_key:api_secret@cloud_name`
   - `GROQ_API_KEY`: the shopping-assistant key
4. Apply the Blueprint and wait for `/ready/` to become healthy.

`SECRET_KEY` is generated by Render. `REDIS_URL` is wired automatically from
the private Render Key Value service. Never commit the real secret values.

The deployment build command is `bash scripts/render-build.sh`; the start
command backfills safe seed media when required and starts Express. React
Router routes are handled by Express's SPA fallback.

## Redis strategy

- Products: 90-second TTL
- Shops: 180-second TTL
- Categories: 300-second TTL
- Assistant answers: 300-second TTL
- Product writes invalidate product and shop cache patterns
- `X-Cache: HIT`, `MISS` or `BYPASS` exposes cache behavior
- Redis failure falls back to PostgreSQL

Set `REDIS_URL=redis://localhost:6379` locally. Docker Compose configures its internal Redis URL automatically.

## Performance evidence

```bash
cd backend
npm run benchmark
```

Each route is requested twice and reports latency plus its `X-Cache` state.

Observed before Redis on the current Neon development database:

| Scenario | Measured latency |
|---|---:|
| Homepage static HTML | 7 ms |
| Warm shops API | 318 ms |
| Neon cold shops request | 2,380 ms |
| AI catalogue request | 2,500 to 2,850 ms |

Run the benchmark with Redis enabled to record comparable miss and hit results on the interview machine. Neon cold-start and network location affect uncached numbers.

## Security decisions

- Short-lived JWT access tokens and stored refresh tokens
- Password hashing with bcrypt
- Backend role and ownership checks
- Parameterized PostgreSQL queries
- Transactional checkout with row locking
- File size limits and Cloudinary-hosted media
- Credentials excluded from the repository
- Health endpoints expose no secrets

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Start the API |
| `npm run seed` | Seed demo data |
| `npm run db:migrate` | Apply pending PostgreSQL migrations |
| `npm test` | Safe smoke tests |
| `npm run test:integration` | Live auth and Socket.IO tests |
| `npm run test:coverage` | Text and HTML coverage report |
| `npm run benchmark` | Cache and API latency evidence |
| `npm run test:e2e` | Browser end-to-end tests |

## Known limitations

- Payment processing is simulated.
- Email and Groq depend on optional external credentials.
- The first Neon request after inactivity can be slower.
- Horizontal Socket.IO scaling would require a Redis adapter.

## Future improvements

- Payment webhooks, refunds and seller payout ledger
- Background jobs for email and invoices
- Redis Socket.IO adapter for multiple API instances
- OpenTelemetry traces and hosted error monitoring
- CI workflow for lint, tests, build and migration checks
