import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sellerOrderApi } from '../../api/endpoints'
import {
  NEXT_STATUSES,
  STATUS_LABEL,
  StatusBadge,
} from '../../components/OrderStatus'
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Money,
  Pagination,
  Select,
  Skeleton,
} from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'

function AdvanceControl({ item, onDone }) {
  const options = NEXT_STATUSES[item.status] || []
  const [next, setNext] = useState(options[0] || '')
  const [tracking, setTracking] = useState(item.tracking_number || '')
  const [error, setError] = useState('')

  const move = useMutation({
    mutationFn: () =>
      sellerOrderApi.setStatus(item.id, {
        status: next,
        // Only meaningful when handing over to a courier.
        ...(next === 'shipped' && tracking ? { tracking_number: tracking } : {}),
      }),
    onSuccess: () => {
      setError('')
      onDone()
    },
    onError: (err) => setError(err.message),
  })

  if (!options.length) {
    return <span className="text-xs text-fg-subtle">No further action</span>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          className="w-auto min-w-36"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABEL[option]}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          loading={move.isPending}
          variant={next === 'cancelled' ? 'danger' : 'primary'}
          onClick={() => move.mutate()}
        >
          {next === 'cancelled' ? 'Cancel line' : 'Update'}
        </Button>
      </div>

      {next === 'shipped' && (
        <Input
          className="text-xs"
          placeholder="Tracking number (optional)"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          maxLength={120}
        />
      )}

      {next === 'cancelled' && (
        <p className="text-right text-xs text-red-600 dark:text-red-400">
          Returns {item.quantity} unit(s) to your stock.
        </p>
      )}
      {error && <p className="text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default function SellerOrders() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search)

  const { data: summary } = useQuery({
    queryKey: ['seller-order-summary'],
    queryFn: sellerOrderApi.summary,
  })

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['seller-order-items', { debounced, statusFilter, page }],
    queryFn: () =>
      sellerOrderApi.items({ q: debounced, status: statusFilter, page }),
    placeholderData: keepPreviousData,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['seller-order-items'] })
    queryClient.invalidateQueries({ queryKey: ['seller-order-summary'] })
    // Cancelling a line puts stock back, so inventory views are stale too.
    queryClient.invalidateQueries({ queryKey: ['seller-products'] })
    queryClient.invalidateQueries({ queryKey: ['seller-low-stock'] })
  }

  const items = data?.results ?? []

  return (
    <div>
      {summary?.needs_action > 0 && (
        <div className="mb-5">
          <Alert tone="warning">
            {summary.needs_action} line{summary.needs_action === 1 ? '' : 's'} waiting on
            you. Confirm and pack them to keep customers informed.
          </Alert>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          type="search"
          className="max-w-xs"
          placeholder="Order number or product…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
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
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
              {summary?.counts?.[value] ? ` (${summary.counts[value]})` : ''}
            </option>
          ))}
        </Select>
      </div>

      {isError && <Alert>{error.message}</Alert>}

      {isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          title={statusFilter || debounced ? 'No matching order lines' : 'No orders yet'}
          description={
            statusFilter || debounced
              ? 'Try clearing the filters.'
              : 'Order lines for your products will appear here once customers buy.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Ship to</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-semibold text-fg">
                      {item.order_number}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {new Date(item.placed_at).toLocaleDateString()}
                    </p>
                    {item.payment_status === 'unpaid' && (
                      <span className="text-xs text-warning-fg">Unpaid</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-surface-muted">
                        {item.image_url && (
                          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-fg-muted">
                          Qty {item.quantity}
                          {item.variant_label && ` · ${item.variant_label}`}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <p className="text-fg">{item.customer_name}</p>
                    <p className="text-xs text-fg-muted">{item.ship_to_city}</p>
                  </td>

                  <td className="px-4 py-3">
                    <Money amount={item.line_total} className="font-medium" />
                  </td>

                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} label={item.status_display} />
                  </td>

                  <td className="px-4 py-3">
                    <AdvanceControl item={item} onDone={refresh} />
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
