import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'

import { catalogApi, shopApi } from '../api/endpoints'
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard'
import {
  Badge,
  Button,
  Card,
  Money,
  SectionHeading,
  Skeleton,
  Stars,
  Thumb,
} from '../components/ui'
import {
  CheckIcon,
  ChevronRightIcon,
  RefreshIcon,
  ShieldIcon,
  SparkleIcon,
  StoreIcon,
  TruckIcon,
} from '../components/icons'

/* -------------------------------------------------------------------- hero */

/**
 * Three real product images, fanned.
 *
 * Live catalogue data rather than stock art, so the hero never advertises
 * something the marketplace doesn't sell. Degrades to a plain translucent panel
 * while the query is in flight instead of to broken-image icons.
 */
function HeroCollage({ products }) {
  if (!products?.length) {
    return (
      <div
        aria-hidden="true"
        className="hidden h-72 rounded-2xl bg-white/5 ring-1 ring-inset ring-white/10 lg:block"
      />
    )
  }

  const tilts = ['-rotate-6 translate-y-4', 'rotate-2', 'rotate-6 translate-y-6']

  return (
    <div className="hidden lg:block">
      <div className="flex items-center justify-center gap-4">
        {products.slice(0, 3).map((product, index) => (
          <Link
            key={product.id}
            to={`/products/${product.slug}`}
            className={`w-44 shrink-0 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-white/10 transition-transform duration-300 ease-out-soft hover:-translate-y-2 hover:rotate-0 ${tilts[index]}`}
          >
            <Thumb src={product.primary_image} alt="" className="w-full rounded-xl" />
            <p className="mt-2.5 truncate text-xs font-semibold text-fg">
              {product.name}
            </p>
            <Money amount={product.price} className="text-sm font-bold text-fg" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function Hero({ products }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-brand-900 text-white">
      {/* Layered radial washes rather than a flat gradient — reads as light
          in a space instead of a colour swatch. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(129,140,248,0.45),transparent_55%),radial-gradient(circle_at_85%_75%,rgba(245,158,11,0.3),transparent_50%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px]"
      />

      <div className="relative grid gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1.08fr_1fr] lg:items-center lg:px-12 lg:py-14">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest ring-1 ring-inset ring-white/20 backdrop-blur">
            <SparkleIcon className="h-3.5 w-3.5" />
            Multi-vendor marketplace
          </span>

          <h1 className="mt-5 max-w-xl text-3xl font-black leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
            Everything you need, from sellers you can trust.
          </h1>

          <p className="mt-4 max-w-lg text-base leading-relaxed text-brand-100">
            Thousands of products across dozens of categories, each shipped by an
            independent seller with their own storefront and inventory.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {/* `variant`, not a className colour override: `cn` cannot resolve
                two competing background utilities, so this button used to lose
                that fight and render brand-on-brand — invisible. */}
            <Button as={Link} to="/products" size="lg" variant="inverse">
              Start shopping
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button as={Link} to="/register" size="lg" variant="glass">
              <StoreIcon className="h-4 w-4" />
              Become a seller
            </Button>
          </div>

          <p className="mt-4 text-sm text-brand-100">
            Free delivery on every order · Cancel any time before dispatch
          </p>

          <div className="mt-5 grid max-w-lg grid-cols-3 divide-x divide-white/15 rounded-2xl border border-white/15 bg-white/[0.08] px-2 py-3 backdrop-blur-sm">
            {[
              ['32+', 'Curated products'],
              ['5', 'Verified shops'],
              ['4★+', 'Buyer rating'],
            ].map(([value, label]) => (
              <div key={label} className="px-2 text-center sm:px-4 sm:text-left">
                <strong className="block text-lg font-black tracking-tight text-white sm:text-xl">
                  {value}
                </strong>
                <span className="mt-0.5 block text-[10px] leading-tight text-brand-100 sm:text-xs">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <HeroCollage products={products} />

      </div>
    </section>
  )
}

/* --------------------------------------------------------------- trust bar */

function TrustBar() {
  const items = [
    { icon: TruckIcon, title: 'Free delivery', copy: 'On every order, no minimum' },
    { icon: ShieldIcon, title: 'Buyer protection', copy: 'Stock verified at checkout' },
    { icon: RefreshIcon, title: 'Easy cancellation', copy: 'Before your parcel ships' },
    { icon: StoreIcon, title: 'Independent sellers', copy: 'Each with their own shop' },
  ]

  return (
    <section className="relative z-10 -mt-8 grid gap-3 px-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, copy }) => (
        <div
          key={title}
          className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">{title}</span>
            <span className="block text-xs text-fg-muted">{copy}</span>
          </span>
        </div>
      ))}
    </section>
  )
}

/* -------------------------------------------------------------- categories */

function CategoryGrid() {
  const { data, isPending } = useQuery({
    queryKey: ['categories', 'root'],
    queryFn: () => catalogApi.categories({ root_only: true }),
    staleTime: 5 * 60 * 1000,
  })

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }

  const categories = data?.results ?? []
  if (!categories.length) return null

  // Rotating tints so a row of category tiles doesn't read as a grey grid.
  const tints = [
    'from-brand-500/15 to-brand-500/5 text-brand-700 dark:text-brand-300',
    'from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300',
    'from-accent-500/20 to-accent-500/5 text-accent-700 dark:text-accent-300',
    'from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-300',
    'from-sky-500/15 to-sky-500/5 text-sky-700 dark:text-sky-300',
    'from-violet-500/15 to-violet-500/5 text-violet-700 dark:text-violet-300',
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {categories.slice(0, 8).map((category, index) => (
        <Link
          key={category.id}
          to={`/products?category=${category.slug}`}
          className={`group relative overflow-hidden rounded-xl border border-line bg-gradient-to-br p-5 transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-md ${tints[index % tints.length]}`}
        >
          <h3 className="text-sm font-bold text-fg">{category.name}</h3>
          <p className="mt-1 text-xs text-fg-muted">
            {category.product_count} product{category.product_count === 1 ? '' : 's'}
          </p>
          <ChevronRightIcon className="absolute bottom-4 right-4 h-4 w-4 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
        </Link>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------- shops */

function ShopStrip() {
  const { data, isPending } = useQuery({
    queryKey: ['shops', 'home'],
    queryFn: () => shopApi.list({ page_size: 6 }),
    staleTime: 5 * 60 * 1000,
  })

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    )
  }

  const shops = data?.results ?? []
  if (!shops.length) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shops.slice(0, 6).map((shop) => (
        <Link
          key={shop.id}
          to={`/shops/${shop.slug}`}
          className="group flex items-center gap-3.5 rounded-xl border border-line bg-surface p-4 transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700"
        >
          <Thumb src={shop.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-fg transition group-hover:text-brand-600 dark:group-hover:text-brand-400">
              {shop.shop_name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-fg-muted">
              {shop.description || 'Independent seller'}
            </span>
          </span>
          <Badge tone="slate" size="sm">
            {shop.product_count}
          </Badge>
        </Link>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- rail */

function ProductRail({ query }) {
  const { data, isPending } = query

  // Grid classes are written out literally, never interpolated: Tailwind
  // extracts class names from source text, so `lg:grid-cols-${n}` produces
  // no CSS at all.
  const grid = 'grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4'

  if (isPending) {
    return (
      <div className={grid}>
        {Array.from({ length: 4 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!data?.results?.length) {
    return (
      <Card className="px-6 py-10 text-center">
        <p className="text-sm text-fg-muted">
          Nothing here yet — run{' '}
          <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-fg">
            manage.py seed_demo
          </code>{' '}
          to populate the catalogue.
        </p>
      </Card>
    )
  }

  return (
    <div className={grid}>
      {data.results.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------- social proof */

function CustomerStories({ products = [] }) {
  const featured = products.slice(0, 3)
  const queries = useQueries({
    queries: featured.map((product) => ({
      queryKey: ['product-reviews', product.slug, 'home-story'],
      queryFn: () => catalogApi.productReviews(product.slug),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const stories = featured
    .map((product, index) => ({
      product,
      review: queries[index]?.data?.results?.find((item) => item.comment),
    }))
    .filter((item) => item.review)

  if (!stories.length) return null

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {stories.map(({ product, review }) => (
        <article
          key={`${product.id}-${review.id}`}
          className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:hover:border-brand-700"
        >
          <div className="absolute -right-5 -top-8 text-[110px] font-black leading-none text-brand-500/[0.05]">
            “
          </div>
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <Stars value={review.rating} showValue />
              {review.is_verified_purchase && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  <CheckIcon className="h-3.5 w-3.5" /> Verified buyer
                </span>
              )}
            </div>
            <h3 className="mt-4 text-sm font-bold text-fg">{review.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-muted">
              “{review.comment}”
            </p>
            <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-xs font-bold text-white">
                {(review.user_name || 'C')[0].toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-fg">{review.user_name}</span>
                <Link
                  to={`/products/${product.slug}`}
                  className="block truncate text-xs text-brand-600 hover:underline dark:text-brand-400"
                >
                  {product.name}
                </Link>
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- page */

export default function Home() {
  const featured = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => catalogApi.products({ is_featured: true, page_size: 4 }),
  })

  const newest = useQuery({
    queryKey: ['products', 'newest'],
    queryFn: () => catalogApi.products({ ordering: '-created_at', page_size: 4 }),
  })

  const topRated = useQuery({
    queryKey: ['products', 'top-rated'],
    queryFn: () => catalogApi.products({ ordering: '-avg_rating', page_size: 4 }),
  })

  const onSale = useQuery({
    queryKey: ['products', 'on-sale'],
    queryFn: () => catalogApi.products({ on_sale: true, page_size: 4 }),
  })

  return (
    <div className="space-y-16">
      <div>
        {/* The hero reuses the featured query rather than firing its own — the
            same four products the rail below already needs. */}
        <Hero products={featured.data?.results} />
        <TrustBar />
      </div>

      <section>
        <SectionHeading
          eyebrow="Browse"
          title="Shop by category"
          description="Every category, with live product counts."
          to="/categories"
        />
        <CategoryGrid />
      </section>

      <section>
        <SectionHeading
          eyebrow="Hand-picked"
          title="Featured products"
          description="Chosen by our sellers."
          to="/products?is_featured=true"
        />
        <ProductRail query={featured} />
      </section>

      <section>
        <SectionHeading
          eyebrow="Deals"
          title="On sale now"
          description="Discounted against their usual price."
          to="/products?on_sale=true"
        />
        <ProductRail query={onSale} />
      </section>

      <section>
        <SectionHeading
          eyebrow="Marketplace"
          title="Meet the shops"
          description="Every product here is sold and shipped by an independent storefront."
          to="/shops"
          linkLabel="All shops"
        />
        <ShopStrip />
      </section>

      <section>
        <SectionHeading eyebrow="Fresh" title="New arrivals" to="/products?ordering=-created_at" />
        <ProductRail query={newest} />
      </section>

      <section>
        <SectionHeading eyebrow="Loved" title="Top rated" to="/products?ordering=-avg_rating" />
        <ProductRail query={topRated} />
      </section>

      <section>
        <SectionHeading
          eyebrow="Real experiences"
          title="Loved by CommerceX buyers"
          description="Verified reviews from customers shopping across our marketplace."
          to="/products?ordering=-avg_rating"
          linkLabel="Explore top rated"
        />
        <CustomerStories products={topRated.data?.results} />
      </section>

      {/* -------------------------------------------------- seller call-out */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="grid gap-8 p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
              Sell on CommerceX
            </p>
            <h2 className="mt-3 text-title font-bold tracking-tight text-fg">
              Open your storefront in minutes
            </h2>
            <p className="mt-4 max-w-md text-fg-muted">
              List products, manage stock with atomic inventory control, and fulfil
              orders from a dashboard built for sellers. Approval takes one review.
            </p>
            <Button as={Link} to="/register" size="lg" className="mt-7">
              <StoreIcon className="h-4 w-4" />
              Become a seller
            </Button>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              'Your own shop page',
              'Inventory & low-stock alerts',
              'Per-order fulfilment',
              'AI product descriptions',
              'Sales overview',
              'Direct line to the platform',
            ].map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-fg-muted"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-400">
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="m8 13.2-3.1-3.1 1.4-1.4L8 10.4l5.7-5.7 1.4 1.4z" />
                  </svg>
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
