# CommerceX — Frontend

React 19 + Vite + Tailwind v4 + React Router 7 + TanStack Query, talking to the
Django REST API in `../../Backend`.

## Setup

```bash
cd Frontend/vite-project
npm install
npm run dev          # http://localhost:5173
```

Start the Django server first (`python manage.py runserver`). The Vite dev server
proxies `/api` and `/media` to `http://127.0.0.1:8000`, so no CORS setup is needed
in development. To point at a different backend, set `VITE_API_BASE_URL` in `.env`.


## Design system

The whole UI is driven by **two layers of tokens** in `src/index.css`:

1. **Raw palette** — `brand-*`, `accent-*` and Tailwind's greys. The paint.
2. **Semantic aliases** — `canvas`, `surface`, `surface-muted`, `fg`, `fg-muted`,
   `fg-subtle`, `line`, `line-strong`, plus `success/warning/danger/info`
   backgrounds, text and borders. Where the paint goes.

Components reference **only layer 2** — `bg-surface`, `text-fg-muted`,
`border-line`. That single rule is why:

- **Dark mode cost ~30 lines**, not a `dark:` variant on every element. The
  `.dark` block at the bottom of `index.css` reassigns the semantic tokens and
  the entire app reskins. A verification script confirms 22 of 23 semantic
  tokens are overridden (`fg-onbrand` is white in both modes, correctly).
- **Rebranding is a one-line edit.** Change `--color-brand-600` and every
  button, link, focus ring and badge follows.

Surfaces get *lighter* as they come forward in dark mode (canvas `#0b1120` →
surface `#131c30` → muted `#1c2942`), which is how elevation reads without
light. Pure black is avoided — it makes shadows invisible and text edges harsh
on OLED. Status colours are re-tuned rather than reused, because light-mode
pastels turn to mud on a dark surface.

### Details worth knowing

**No flash of light theme.** An inline script in `index.html` applies the stored
theme before first paint. This can't be fixed from React — React runs after the
document has already painted, so the white flash is unavoidable without it.

**Focus is visible everywhere.** A single `:focus-visible` rule in `@layer base`
gives every interactive element a brand-coloured ring, keyboard-only. Removing
outlines without replacing them is the most common a11y regression in Tailwind
projects.

**Reduced motion is respected.** A `prefers-reduced-motion` block collapses all
animation and transition durations.

**Class names are never interpolated from fragments.** Tailwind extracts class
names from source text, so `` `lg:grid-cols-${n}` `` produces no CSS. Where
dynamic styling is needed, whole literal class strings are selected from a
lookup table (see the category tints in `Home.jsx`).

**`cn()` instead of clsx + tailwind-merge.** Every primitive composes base
classes then appends the caller's `className` last, which wins on source order
at equal specificity — no 8 kB dependency needed.

### Primitives

`src/components/ui.jsx` — `Button` (6 variants × 5 sizes), `Input`, `Textarea`,
`Select`, `Checkbox`, `RadioCard`, `Field`, `Card`/`CardHeader`/`CardBody`,
`Alert`, `Badge`, `Stars` (with real half-stars), `Skeleton` (shimmer, not
pulse), `EmptyState`, `PageHeader`, `Breadcrumbs`, `SectionHeading`,
`Pagination`, `Money`, `PriceBlock`, `Divider`, `Thumb`, `ScrollRow`.

`Button` sets `aria-disabled` when rendered `as={Link}` — anchors ignore the
`disabled` attribute, so without it a "disabled" link stays clickable.

## Structure

```
src/
├── api/
│   ├── tokens.js       access token in memory, refresh token in localStorage
│   ├── client.js       axios instance, refresh interceptor, error normaliser
│   └── endpoints.js    one function per API route
├── context/AuthContext.jsx   session state, login/register/logout
├── hooks/              useAuth, useDebounce
├── components/
│   ├── Layout.jsx      navbar (role-aware) + footer
│   ├── RouteGuards.jsx RequireAuth / RequireAnonymous
│   ├── ProductCard.jsx card + skeleton
│   └── ui.jsx          Button, Field, Input, Alert, Badge, Stars, Pagination…
└── pages/
    ├── Home.jsx           hero, categories, featured / new / top-rated
    ├── ProductList.jsx    search, filters, sorting, pagination
    ├── ProductDetail.jsx  gallery, variants, reviews, review form
    ├── Categories.jsx     recursive category tree
    ├── Account.jsx        profile, addresses, password
    ├── Errors.jsx         404 / 403
    └── auth/              Login, Register
```

## Notes on the implementation

**Token handling.** The access token lives in a module variable, never in
`localStorage`, so an XSS payload can't read it from storage. Only the refresh
token is persisted, and on page load it's exchanged for a fresh access token
before the app renders. In production the refresh token should move to an
httpOnly cookie issued by Django.

**Refresh de-duplication.** When several requests 401 at once, the first one
performs the refresh and the rest await the same promise. Without this, and with
`ROTATE_REFRESH_TOKENS=True` on the backend, parallel refreshes would invalidate
each other and log the user out.

**Errors.** `normalizeError` flattens DRF's response shapes — `{detail: "..."}`,
`{field: ["..."]}`, and bare strings — into `{ message, fields, status }`, so
forms can show per-field errors without each page re-implementing the parsing.

**URL as state.** Search, filters, sorting and page number live in the query
string, so results are shareable, survive refresh, and the browser back button
behaves correctly.

**Caching.** TanStack Query caches by key and `keepPreviousData` keeps the old
grid on screen while the next page loads, avoiding layout flashes. Queries don't
retry on 401/403/404 since those will never succeed on retry.

## Not built yet (Phase 2)

Cart, wishlist and checkout — the "Add to cart" button is intentionally inert
until the backend has those endpoints. Seller and admin dashboards currently
redirect to the account page; the API client already has `adjustStock`,
`lowStock`, `reviewSeller` and `auditLogs` wired for them.
