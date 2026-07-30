import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { catalogApi, profileApi, shopApi } from '../../api/endpoints'
import { PackageIcon } from '../../components/icons'
import {
  Alert,
  Badge,
  Money,
  PriceBlock,
  Skeleton,
  Stars,
  Thumb,
} from '../../components/ui'

/**
 * The seller's own shop, rendered the way a customer sees it.
 *
 * This does NOT reuse the customer `ShopDetail` page or `ProductCard`. Both pull
 * in cart state — `ProductCard` has a quick-add button wired to `useCart` — and
 * importing either would give the seller dashboard a live import path to the
 * cart, which is exactly the separation the three-layout split exists to
 * enforce. A read-only card is also more correct: a seller should not be able to
 * add their own product to a cart they do not have.
 */
function PreviewCard({ product }) {
  const outOfStock = product.stock === 0

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="relative">
        <Thumb src={product.primary_image} alt="" className="w-full" />
        {outOfStock && (
          <div className="absolute inset-0 grid place-items-center bg-surface/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-fg px-3 py-1 text-xs font-semibold text-canvas">
              Out of stock
            </span>
          </div>
        )}
        {product.compare_at_price && !outOfStock && (
          <span className="absolute left-2.5 top-2.5">
            <Badge tone="rose">Sale</Badge>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="line-clamp-2 text-sm font-semibold text-fg">{product.name}</p>
        {product.avg_rating ? (
          <div className="mt-1.5">
            <Stars value={product.avg_rating} count={product.review_count} showValue />
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-fg-subtle">No reviews yet</p>
        )}
        <div className="mt-auto pt-3">
          <PriceBlock price={product.price} compareAt={product.compare_at_price} />
        </div>
      </div>
    </div>
  )
}

export default function ShopPreview() {
  const profile = useQuery({
    queryKey: ['seller-profile'],
    queryFn: profileApi.seller,
  })

  const slug = profile.data?.slug

  const shop = useQuery({
    queryKey: ['shop', slug],
    queryFn: () => shopApi.detail(slug),
    enabled: Boolean(slug),
    retry: false,
  })

  // Published only, matching what a customer would actually see. Showing drafts
  // here would defeat the purpose of a preview.
  const products = useQuery({
    queryKey: ['shop-preview-products', slug],
    queryFn: () => catalogApi.products({ seller: slug, page_size: 24 }),
    enabled: Boolean(slug),
  })

  if (profile.isPending) return <Skeleton className="h-64" />

  if (!slug) {
    return (
      <Alert>
        Your shop profile is incomplete. Add a shop name in{' '}
        <Link to="/seller/store" className="font-semibold underline">
          shop settings
        </Link>{' '}
        first.
      </Alert>
    )
  }

  const data = shop.data
  const items = products.data?.results ?? []
  const pending = !profile.data?.is_approved

  return (
    <div>
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">Storefront preview</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Exactly what a customer sees at <code className="text-fg">/shops/{slug}</code>.
            </p>
          </div>
          <Badge tone="slate">Read-only</Badge>
        </div>
      </header>

      {pending && (
        <div className="mb-5">
          <Alert tone="warning">
            This is a preview only. Your shop is not listed publicly until an admin
            approves it, so this page is not reachable by customers yet.
          </Alert>
        </div>
      )}

      {shop.isError && (
        <Alert>
          {shop.error?.status === 404
            ? 'Your shop is not published yet, so there is nothing to preview.'
            : shop.error.message}
        </Alert>
      )}

      {shop.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        data && (
          <>
            {/* ------------------------------------------- shop header */}
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <div className="h-24 bg-gradient-to-br from-brand-600 to-brand-800 sm:h-32" />
              <div className="px-5 pb-5 sm:px-7">
                <div className="-mt-10 flex flex-wrap items-end gap-4 sm:-mt-12">
                  <Thumb
                    src={data.logo}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-2xl ring-4 ring-surface sm:h-24 sm:w-24"
                  />
                  <div className="min-w-0 flex-1 pb-1">
                    <h2 className="truncate text-2xl font-bold tracking-tight text-fg">
                      {data.shop_name}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone="brand">
                        {data.product_count}{' '}
                        {data.product_count === 1 ? 'product' : 'products'}
                      </Badge>
                      <span className="text-xs text-fg-subtle">
                        Selling since {new Date(data.created_at).getFullYear()}
                      </span>
                    </div>
                  </div>
                </div>

                {data.description ? (
                  <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-fg-muted">
                    {data.description}
                  </p>
                ) : (
                  <p className="mt-4 text-sm italic text-fg-subtle">
                    No shop description yet —{' '}
                    <Link to="/seller/store" className="not-italic font-semibold underline">
                      add one
                    </Link>{' '}
                    so customers know who you are.
                  </p>
                )}
              </div>
            </div>

            {/* ----------------------------------------------- products */}
            <h2 className="mb-3 mt-6 text-lg font-semibold text-fg">
              Products
              {items.length > 0 && (
                <span className="ml-2 text-sm font-normal text-fg-subtle">
                  {products.data?.count ?? items.length}
                </span>
              )}
            </h2>

            {products.isPending ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-64" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
                <PackageIcon className="mx-auto h-6 w-6 text-fg-subtle" />
                <p className="mt-3 font-semibold text-fg">Nothing published yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
                  Customers see an empty shop. Publish a product to fill this page.
                </p>
                <Link
                  to="/seller/products/new"
                  className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  Add a product
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {items.map((product) => (
                  <PreviewCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
