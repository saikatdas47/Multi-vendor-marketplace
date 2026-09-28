import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useCart } from '../hooks/useCart'
import { cn } from '../lib/cn'
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  Money,
  PageHeader,
  Skeleton,
  Thumb,
} from '../components/ui'
import {
  CartIcon,
  MinusIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
  TruckIcon,
} from '../components/icons'

function QuantityStepper({ item, onChange, disabled }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
      <button
        type="button"
        disabled={disabled || item.quantity <= 1}
        onClick={() => onChange(item.quantity - 1)}
        aria-label="Decrease quantity"
        className="grid h-9 w-9 place-items-center rounded-l-lg text-fg-muted transition hover:bg-surface-muted disabled:opacity-30"
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <span className="w-9 text-center text-sm font-semibold tabular-nums text-fg">
        {item.quantity}
      </span>
      <button
        type="button"
        disabled={disabled || item.quantity >= item.available_stock}
        onClick={() => onChange(item.quantity + 1)}
        aria-label="Increase quantity"
        className="grid h-9 w-9 place-items-center rounded-r-lg text-fg-muted transition hover:bg-surface-muted disabled:opacity-30"
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function CartRow({ item, cart }) {
  const [error, setError] = useState('')
  const busy =
    cart.updateItem.isPending || cart.removeItem.isPending || cart.resyncPrice.isPending

  const hasIssue = item.available_stock === 0 || item.quantity > item.available_stock

  return (
    <li
      className={cn(
        'flex gap-4 p-5 transition-colors',
        hasIssue && 'bg-danger-bg/40',
      )}
    >
      <Link to={`/products/${item.product.slug}`} className="shrink-0">
        <Thumb
          src={item.product.primary_image}
          alt={item.product.name}
          className="h-24 w-24 rounded-lg border border-line"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <Link
              to={`/products/${item.product.slug}`}
              className="line-clamp-2 text-sm font-semibold text-fg transition hover:text-brand-600 dark:hover:text-brand-400"
            >
              {item.product.name}
            </Link>
            <p className="mt-0.5 text-xs text-fg-subtle">{item.product.seller_name}</p>
            {item.variant_label && (
              <p className="mt-0.5 text-xs text-fg-muted">{item.variant_label}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <Money amount={item.line_total} className="text-sm font-bold text-fg" />
            {item.quantity > 1 && (
              <p className="mt-0.5 text-xs text-fg-subtle">
                <Money amount={item.unit_price} /> each
              </p>
            )}
          </div>
        </div>

        {item.price_changed && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-warning-line bg-warning-bg px-3 py-2 text-xs text-warning-fg">
            <span>
              Price changed from <Money amount={item.unit_price} /> to{' '}
              <Money amount={item.current_price} />.
            </span>
            <button
              onClick={() => cart.resyncPrice.mutate(item.id)}
              className="font-semibold underline underline-offset-2"
            >
              Accept new price
            </button>
          </div>
        )}

        {item.available_stock === 0 ? (
          <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
            Out of stock — remove to continue
          </p>
        ) : item.quantity > item.available_stock ? (
          <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
            Only {item.available_stock} left — reduce the quantity
          </p>
        ) : null}

        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <QuantityStepper
            item={item}
            disabled={busy}
            onChange={(quantity) => {
              setError('')
              cart.updateItem.mutate(
                { itemId: item.id, quantity },
                { onError: (err) => setError(err.message) },
              )
            }}
          />
          <button
            onClick={() => cart.removeItem.mutate(item.id)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-fg-subtle transition hover:bg-danger-bg hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}

export default function Cart() {
  const cart = useCart()

  if (cart.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-52" />
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (!cart.items.length) {
    return (
      <div className="py-10">
        <EmptyState
          icon={<CartIcon className="h-6 w-6" />}
          title="Your cart is empty"
          description="Browse the catalogue and add something you like — it'll show up here."
          action={
            <Button as={Link} to="/products" size="lg">
              Start shopping
            </Button>
          }
        />
      </div>
    )
  }

  const blocked = cart.issues.length > 0

  return (
    <div>
      <PageHeader
        title="Shopping cart"
        subtitle={`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'} from ${
          new Set(cart.items.map((i) => i.product.seller_name)).size
        } seller(s)`}
        action={
          <Button variant="ghost" size="sm" onClick={() => cart.clear.mutate()}>
            <TrashIcon className="h-4 w-4" />
            Clear cart
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {cart.items.map((item) => (
              <CartRow key={item.id} item={item} cart={cart} />
            ))}
          </ul>
        </Card>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="space-y-5">
              <h2 className="text-base font-semibold text-fg">Order summary</h2>

              {blocked && (
                <Alert tone="warning" title="Needs attention">
                  Resolve the highlighted items before checking out.
                </Alert>
              )}

              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">
                    Subtotal ({cart.itemCount} item{cart.itemCount === 1 ? '' : 's'})
                  </dt>
                  <dd className="font-semibold text-fg">
                    <Money amount={cart.subtotal} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Delivery</dt>
                  <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Free
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-3">
                  <dt className="text-base font-semibold text-fg">Total</dt>
                  <dd>
                    <Money amount={cart.subtotal} size="lg" className="font-bold text-fg" />
                  </dd>
                </div>
              </dl>

              <Button
                as={Link}
                to="/checkout"
                size="lg"
                className="w-full"
                disabled={blocked}
              >
                Proceed to checkout
              </Button>

              <Button as={Link} to="/products" variant="secondary" className="w-full">
                Continue shopping
              </Button>

              <div className="space-y-2 border-t border-line pt-4 text-xs text-fg-subtle">
                <p className="flex items-center gap-2">
                  <TruckIcon className="h-3.5 w-3.5" />
                  Free delivery on every order
                </p>
                <p className="flex items-center gap-2">
                  <ShieldIcon className="h-3.5 w-3.5" />
                  Stock re-verified when you place the order
                </p>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  )
}
