import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { shopApi } from '../api/endpoints'
import { StoreIcon } from '../components/icons'
import {
  Alert,
  Badge,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
  Thumb,
} from '../components/ui'
import { useDebounce } from '../hooks/useDebounce'

function ShopCard({ shop }) {
  return (
    <Link
      to={`/shops/${shop.slug}`}
      className="group flex flex-col rounded-card border border-line bg-surface p-5 transition hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700"
    >
      <div className="flex items-center gap-3">
        <Thumb src={shop.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-fg transition group-hover:text-brand-600 dark:group-hover:text-brand-400">
            {shop.shop_name}
          </h2>
          <p className="text-xs text-fg-subtle">
            Since {new Date(shop.created_at).getFullYear()}
          </p>
        </div>
      </div>

      {shop.description && (
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-fg-muted">
          {shop.description}
        </p>
      )}

      <div className="mt-4 pt-1">
        <Badge tone={shop.product_count > 0 ? 'brand' : 'slate'}>
          {shop.product_count} {shop.product_count === 1 ? 'product' : 'products'}
        </Badge>
      </div>
    </Link>
  )
}

export default function ShopList() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search, 300)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shops', { search: debounced, page }],
    queryFn: () => shopApi.list({ search: debounced, page }),
  })

  const shops = Array.isArray(data) ? data : (data?.results ?? [])
  const count = data?.count ?? shops.length
  // The API's pagination class returns `page` and `pages` directly, so there is
  // no need to divide count by a page size — which would be wrong on the last
  // page anyway, since it holds fewer rows than page_size.
  const pages = data?.pages ?? 1

  return (
    <div>
      <PageHeader
        eyebrow="Marketplace"
        title="Shops"
        subtitle={
          count
            ? `${count} independent ${count === 1 ? 'shop' : 'shops'} selling on CommerceX.`
            : 'Independent shops selling on CommerceX.'
        }
      />

      <div className="mb-6 max-w-sm">
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            // A new query invalidates the current page number.
            setPage(1)
          }}
          placeholder="Search shops"
        />
      </div>

      {isError && <Alert>{error.message}</Alert>}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : shops.length === 0 ? (
        <EmptyState
          icon={<StoreIcon className="h-6 w-6" />}
          title={debounced ? 'No shops match that search' : 'No shops yet'}
          description={
            debounced
              ? 'Try a shorter or different search term.'
              : 'Approved shops will appear here.'
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} />
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </>
      )}
    </div>
  )
}
