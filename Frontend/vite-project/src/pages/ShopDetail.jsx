import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { shopApi } from '../api/endpoints'
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard'
import { PackageIcon, StoreIcon } from '../components/icons'
import {
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  Pagination,
  Select,
  Skeleton,
  Thumb,
} from '../components/ui'
import { NotFound } from './Errors'

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Newest' },
  { value: 'price', label: 'Price: low to high' },
  { value: '-price', label: 'Price: high to low' },
  { value: 'name', label: 'Name' },
]

export default function ShopDetail() {
  const { slug } = useParams()
  const [page, setPage] = useState(1)
  const [ordering, setOrdering] = useState('-created_at')

  const shop = useQuery({
    queryKey: ['shop', slug],
    queryFn: () => shopApi.detail(slug),
    retry: false,
  })

  const products = useQuery({
    queryKey: ['shop-products', slug, { page, ordering }],
    queryFn: () => shopApi.products(slug, { page, ordering }),
    // Waiting for the shop keeps a 404 from firing two failed requests.
    enabled: shop.isSuccess,
  })

  // A missing or unapproved shop is a 404, not an error banner — the URL is
  // simply not a page.
  if (shop.isError && shop.error?.status === 404) return <NotFound />

  if (shop.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (shop.isError) return <Alert>{shop.error.message}</Alert>

  const data = shop.data
  const items = products.data?.results ?? []
  const total = products.data?.count ?? 0

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Shops', to: '/shops' },
          { label: data.shop_name },
        ]}
      />

      {/* ------------------------------------------------------------ header */}
      <header className="mb-8 overflow-hidden rounded-card border border-line bg-surface">
        <div className="h-24 bg-gradient-to-br from-brand-600 to-brand-800 sm:h-32" />
        <div className="px-5 pb-5 sm:px-7">
          <div className="-mt-10 flex flex-wrap items-end gap-4 sm:-mt-12">
            <Thumb
              src={data.logo}
              alt=""
              className="h-20 w-20 shrink-0 rounded-2xl ring-4 ring-surface sm:h-24 sm:w-24"
            />
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {data.shop_name}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge tone="brand">
                  {data.product_count} {data.product_count === 1 ? 'product' : 'products'}
                </Badge>
                <span className="text-xs text-fg-subtle">
                  Selling since {new Date(data.created_at).getFullYear()}
                </span>
              </div>
            </div>
          </div>

          {data.description && (
            <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-fg-muted">
              {data.description}
            </p>
          )}
        </div>
      </header>

      {/* ---------------------------------------------------------- products */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">
          Products
          {total > 0 && <span className="ml-2 text-sm font-normal text-fg-subtle">{total}</span>}
        </h2>
        {items.length > 0 && (
          <Select
            value={ordering}
            onChange={(e) => {
              setOrdering(e.target.value)
              setPage(1)
            }}
            className="max-w-48"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {products.isError && <Alert>{products.error.message}</Alert>}

      {products.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="h-6 w-6" />}
          title="No products yet"
          description={`${data.shop_name} has not published anything so far.`}
          action={
            <Link
              to="/products"
              className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              Browse all products
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <Pagination
            page={products.data?.page ?? 1}
            pages={products.data?.pages ?? 1}
            onChange={(p) => {
              setPage(p)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </>
      )}
    </div>
  )
}
