import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { catalogApi } from '../../api/endpoints'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Money,
  Pagination,
  Select,
  Skeleton,
} from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'

const STATUS_TONE = { published: 'green', draft: 'slate', archived: 'rose' }

export default function SellerProducts() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const debouncedSearch = useDebounce(search)

  const { data, isPending } = useQuery({
    queryKey: ['seller-products', { debouncedSearch, statusFilter, page }],
    queryFn: () =>
      catalogApi.products({
        mine: 1,
        q: debouncedSearch,
        status: statusFilter,
        page,
        page_size: 20,
      }),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: catalogApi.deleteProduct,
    onSuccess: () => {
      setError('')
      queryClient.invalidateQueries({ queryKey: ['seller-products'] })
      queryClient.invalidateQueries({ queryKey: ['seller-low-stock'] })
    },
    onError: (err) => setError(err.message),
  })

  const products = data?.results ?? []

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Search my products…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="max-w-xs"
        />
        <Select
          className="w-auto"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <Button as={Link} to="/seller/products/new" className="ml-auto">
          Add product
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {isPending ? (
        <Skeleton className="h-64" />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Create your first product to start selling."
          action={
            <Button as={Link} to="/seller/products/new">
              Add product
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-surface-muted">
                        {p.primary_image && (
                          <img src={p.primary_image} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/seller/products/${p.slug}`}
                          className="block truncate font-medium text-fg hover:text-brand-700"
                        >
                          {p.name}
                        </Link>
                        <span className="text-xs text-fg-muted">{p.category_name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Money amount={p.price} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.stock === 0
                          ? 'font-medium text-red-600 dark:text-red-400'
                          : p.stock <= 5
                            ? 'font-medium text-amber-700 dark:text-amber-400'
                            : 'text-fg'
                      }
                    >
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {p.avg_rating ? `${p.avg_rating.toFixed(1)} (${p.review_count})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/seller/products/${p.slug}`}
                      className="mr-3 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete "${p.name}"? This can be undone by an admin.`)) {
                          deleteMutation.mutate(p.slug)
                        }
                      }}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onChange={setPage} />
    </div>
  )
}
