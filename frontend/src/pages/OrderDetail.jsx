import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { orderApi } from '../api/endpoints'
import { StatusBadge, TrackingTimeline } from '../components/OrderStatus'
import {
  Alert,
  Button,
  EmptyState,
  Money,
  Skeleton,
  Textarea,
  Thumb,
} from '../components/ui'

function CancelBox({ order, onCancelled }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const cancel = useMutation({
    mutationFn: () => orderApi.cancel(order.number, reason),
    onSuccess: onCancelled,
    onError: (err) => setError(err.message),
  })

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-danger-line bg-danger-bg p-4">
      <p className="text-sm font-semibold text-danger-fg">Cancel this order?</p>
      <p className="text-xs text-danger-fg opacity-90">
        Every item is returned to the sellers' stock. This can't be undone.
      </p>
      {error && <Alert>{error}</Alert>}
      <Textarea
        rows={2}
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
      />
      <div className="flex gap-2">
        <Button variant="danger" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>
          Yes, cancel it
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep order
        </Button>
      </div>
    </div>
  )
}

export default function OrderDetail() {
  const { number } = useParams()
  const [searchParams] = useSearchParams()
  const justPlaced = searchParams.get('placed') === '1'
  const queryClient = useQueryClient()

  const { data: order, isPending, isError, error } = useQuery({
    queryKey: ['order', number],
    queryFn: () => orderApi.get(number),
  })

  if (isPending) return <Skeleton className="h-96" />

  if (isError) {
    return (
      <EmptyState
        title="Order not found"
        description={error.message}
        action={
          <Button as={Link} to="/orders" variant="secondary">
            Back to my orders
          </Button>
        }
      />
    )
  }

  const address = order.shipping_address || {
    full_name: order.ship_to_name || 'Customer',
    phone: order.ship_to_phone || '',
    line1: order.ship_to_line1 || '',
    line2: order.ship_to_line2 || '',
    city: order.ship_to_city || '',
    state: order.ship_to_state || '',
    postal_code: order.ship_to_postal_code || '',
    country: order.ship_to_country || '',
  }

  return (
    <div className="space-y-6">
      {justPlaced && (
        <Alert tone="success">
          Order placed. We've recorded it as <strong>{order.number}</strong> — the seller
          will confirm shortly.
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/orders" className="text-sm text-brand-600 hover:text-brand-600 dark:hover:text-brand-400 dark:text-brand-400">
            ← My orders
          </Link>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-fg">
            {order.number}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Placed {new Date(order.placed_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} label={order.status_display} />
          <StatusBadge
            status={order.payment_status === 'paid' ? 'delivered' : 'pending'}
            label={order.payment_status_display}
          />
        </div>
      </div>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-5 text-base font-semibold text-fg">Tracking</h2>
        <TrackingTimeline status={order.status} events={order.events} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="mb-4 text-base font-semibold text-fg">
            Items ({order.items.length})
          </h2>
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <Thumb
                  src={item.image_url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg border border-line"
                />

                <div className="min-w-0 flex-1">
                  {item.product_slug ? (
                    <Link
                      to={`/products/${item.product_slug}`}
                      className="text-sm font-medium text-fg hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {item.product_name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-fg">
                      {item.product_name}
                    </span>
                  )}
                  <p className="text-xs text-fg-muted">
                    {item.seller_name} · SKU {item.product_sku}
                    {item.variant_label && ` · ${item.variant_label}`}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={item.status} label={item.status_display} />
                    {item.tracking_number && (
                      <span className="text-xs text-fg-muted">
                        Tracking: {item.tracking_number}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <Money amount={item.line_total} className="text-sm font-semibold" />
                  <p className="text-xs text-fg-muted">
                    <Money amount={item.unit_price} /> × {item.quantity}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {order.items.length > 1 && (
            <p className="mt-4 rounded-lg bg-surface-muted p-3 text-xs text-fg-muted">
              This order contains items from {new Set(order.items.map((i) => i.seller_name)).size}{' '}
              seller(s). Each ships separately, so statuses can differ.
            </p>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-card border border-line bg-surface p-6">
            <h2 className="mb-3 text-base font-semibold text-fg">Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Subtotal</dt>
                <dd><Money amount={order.subtotal} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Shipping</dt>
                <dd><Money amount={order.shipping_fee} /></dd>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>Discount</dt>
                  <dd>−<Money amount={order.discount} /></dd>
                </div>
              )}
              {Number(order.tax) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Tax</dt>
                  <dd><Money amount={order.tax} /></dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base">
                <dt className="font-semibold text-fg">Total</dt>
                <dd className="font-bold text-fg"><Money amount={order.total} /></dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-fg-muted">
              Paid by {order.payment_method_display}
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface p-6 text-sm">
            <h2 className="mb-3 text-base font-semibold text-fg">Delivering to</h2>
            <p className="font-medium text-fg">{address.full_name}</p>
            <p className="text-fg-muted">
              {address.line1}
              {address.line2 && `, ${address.line2}`}
            </p>
            <p className="text-fg-muted">
              {address.city}
              {address.state && `, ${address.state}`} {address.postal_code}
            </p>
            <p className="text-fg-muted">{address.country}</p>
            <p className="mt-2 text-fg-subtle">{address.phone}</p>
          </div>

          {order.customer_note && (
            <div className="rounded-card border border-line bg-surface p-6 text-sm">
              <h2 className="mb-2 text-base font-semibold text-fg">Your note</h2>
              <p className="whitespace-pre-line text-fg-muted">{order.customer_note}</p>
            </div>
          )}

          {order.can_customer_cancel && (
            <CancelBox
              order={order}
              onCancelled={() => {
                queryClient.invalidateQueries({ queryKey: ['order', number] })
                queryClient.invalidateQueries({ queryKey: ['orders'] })
              }}
            />
          )}
        </aside>
      </div>

      {order.events.length > 0 && (
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="mb-4 text-base font-semibold text-fg">History</h2>
          <ol className="space-y-3">
            {order.events.map((event) => (
              <li key={event.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <div>
                  <p className="font-semibold text-fg">{event.status_display}</p>
                  {event.note && <p className="text-fg-muted">{event.note}</p>}
                  <p className="text-xs text-fg-subtle">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
