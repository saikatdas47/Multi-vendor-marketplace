import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { catalogApi } from '../../api/endpoints'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Skeleton,
} from '../../components/ui'

function StockRow({ product, onAdjusted }) {
  const [delta, setDelta] = useState('')
  const [error, setError] = useState('')

  const adjust = useMutation({
    mutationFn: (value) =>
      catalogApi.adjustStock(product.slug, { delta: value, reason: 'Manual adjustment' }),
    onSuccess: () => {
      setDelta('')
      setError('')
      onAdjusted()
    },
    onError: (err) => setError(err.message),
  })

  function apply(value) {
    const amount = Number(value)
    if (!amount) {
      setError('Enter a non-zero amount.')
      return
    }
    adjust.mutate(amount)
  }

  return (
    <tr className="hover:bg-surface-muted">
      <td className="px-4 py-3">
        <Link
          to={`/seller/products/${product.slug}`}
          className="font-medium text-fg hover:text-brand-700"
        >
          {product.name}
        </Link>
        <p className="text-xs text-fg-muted">{product.category_name}</p>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </td>
      <td className="px-4 py-3">
        <Badge tone={product.stock === 0 ? 'rose' : 'amber'}>
          {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={adjust.isPending || product.stock === 0}
            onClick={() => apply(-1)}
          >
            −1
          </Button>
          <Input
            type="number"
            className="w-24"
            placeholder="±"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply(delta)
              }
            }}
          />
          <Button size="sm" loading={adjust.isPending} onClick={() => apply(delta)}>
            Apply
          </Button>
          <Button size="sm" variant="secondary" disabled={adjust.isPending} onClick={() => apply(10)}>
            +10
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function SellerInventory() {
  const queryClient = useQueryClient()

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['seller-low-stock', 'full'],
    queryFn: () => catalogApi.lowStock({ page_size: 100 }),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['seller-low-stock'] })
    queryClient.invalidateQueries({ queryKey: ['seller-products'] })
  }

  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <Alert>{error.message}</Alert>

  const products = data?.results ?? []

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-fg">Low and out of stock</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Products at or below their low-stock threshold. Adjustments are atomic — stock can
          never go negative, even with two tabs open.
        </p>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Everything is well stocked"
          description="Nothing is at or below its low-stock threshold right now."
          action={
            <Button as={Link} to="/seller/products" variant="secondary">
              View all products
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 text-right font-medium">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => (
                <StockRow key={p.id} product={p} onAdjusted={refresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
