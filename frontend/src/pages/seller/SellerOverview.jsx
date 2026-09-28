import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { billingApi, catalogApi, sellerOrderApi } from '../../api/endpoints'
import { BarChart, StackedBar } from '../../components/Chart'
import {
  ClipboardIcon,
  LayersIcon,
  MegaphoneIcon,
  PackageIcon,
} from '../../components/icons'
import { Alert, Badge, Button, Money, Skeleton } from '../../components/ui'
import { cn } from '../../lib/cn'

function Stat({ label, value, hint, tone = 'slate', icon: Icon, to }) {
  const tones = {
    slate: 'text-fg',
    brand: 'text-brand-700 dark:text-brand-300',
    amber: 'text-amber-700 dark:text-amber-400',
    rose: 'text-red-700 dark:text-red-400',
    green: 'text-emerald-700 dark:text-emerald-400',
  }

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />}
      </div>
      <p className={cn('mt-1.5 text-3xl font-bold tabular-nums', tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </>
  )

  const shell = 'rounded-card border border-line bg-surface p-5 transition'
  return to ? (
    <Link
      to={to}
      className={cn(
        shell,
        'block hover:border-brand-300 hover:shadow-sm dark:hover:border-brand-700',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}

export default function SellerOverview() {
  const products = useQuery({
    queryKey: ['seller-products', 'all'],
    queryFn: () => catalogApi.products({ mine: 1, page_size: 100 }),
  })

  const orders = useQuery({
    queryKey: ['seller-order-summary'],
    queryFn: sellerOrderApi.summary,
  })

  const fees = useQuery({
    queryKey: ['seller-fee-summary'],
    queryFn: billingApi.feeSummary,
    retry: false,
  })

  if (products.isPending) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  const rows = products.data?.results ?? []
  const published = rows.filter((p) => p.status === 'published').length
  const drafts = rows.filter((p) => p.status === 'draft').length
  const outOfStock = rows.filter((p) => p.stock === 0).length
  const lowStock = rows.filter((p) => p.stock > 0 && p.stock <= 5).length

  const counts = orders.data?.counts ?? {}
  const needsAction = orders.data?.needs_action ?? 0
  const outstanding = Number(fees.data?.outstanding ?? 0)
  const nextDue = fees.data?.next_due

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------- fee reminder */}
      {outstanding > 0 && (
        <Alert tone={nextDue?.is_overdue ? 'error' : 'warning'}>
          <span>
            Platform fee of <Money amount={outstanding} className="font-semibold" />{' '}
            {nextDue?.is_overdue ? 'is overdue' : 'is due'}
            {nextDue &&
              ` (${nextDue.period_label}, due ${new Date(nextDue.due_date).toLocaleDateString()})`}
            .{' '}
            <Link to="/seller/fees" className="font-semibold underline">
              Pay now
            </Link>
          </span>
        </Alert>
      )}

      {/* --------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Revenue"
          value={<Money amount={orders.data?.gross_revenue ?? 0} />}
          hint={`${orders.data?.units_sold ?? 0} units · ${orders.data?.customers ?? 0} customers`}
          tone="brand"
        />
        <Stat
          label="Needs action"
          value={needsAction}
          hint="Pending and confirmed orders"
          tone={needsAction > 0 ? 'amber' : 'slate'}
          icon={ClipboardIcon}
          to="/seller/orders"
        />
        <Stat
          label="Live products"
          value={published}
          hint={drafts ? `${drafts} draft${drafts === 1 ? '' : 's'}` : 'No drafts'}
          icon={PackageIcon}
          to="/seller/products"
        />
        <Stat
          label="Stock alerts"
          value={outOfStock + lowStock}
          hint={`${outOfStock} out, ${lowStock} low`}
          tone={outOfStock + lowStock > 0 ? 'rose' : 'green'}
          icon={LayersIcon}
          to="/seller/inventory"
        />
      </div>

      {/* --------------------------------------------------------- chart */}
      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-fg">Sales, last 30 days</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Excludes cancelled and refunded lines.
            </p>
          </div>
          <Button as={Link} to="/seller/orders" size="sm" variant="secondary">
            View orders
          </Button>
        </div>

        {orders.isPending ? (
          <Skeleton className="h-56" />
        ) : orders.isError ? (
          <Alert>{orders.error.message}</Alert>
        ) : (
          <BarChart data={orders.data?.daily ?? []} valueKey="revenue" />
        )}
      </section>

      {/* ------------------------------------------------ order pipeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-fg">Order pipeline</h2>
          <p className="mb-4 mt-0.5 text-sm text-fg-muted">
            Where your line items currently sit.
          </p>
          <StackedBar
            segments={[
              { label: 'Pending', value: counts.pending ?? 0, tone: 'amber' },
              { label: 'Confirmed', value: counts.confirmed ?? 0, tone: 'brand' },
              { label: 'Shipped', value: counts.shipped ?? 0, tone: 'brand' },
              { label: 'Delivered', value: counts.delivered ?? 0, tone: 'green' },
              { label: 'Cancelled', value: counts.cancelled ?? 0, tone: 'rose' },
            ]}
          />
        </section>

        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-fg">Quick links</h2>
          <div className="mt-3 space-y-2">
            <Link
              to="/seller/preview"
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5 text-sm transition hover:bg-surface-hover"
            >
              <span className="font-medium text-fg">See my shop as customers do</span>
              <Badge tone="slate">Preview</Badge>
            </Link>
            <Link
              to="/seller/messages"
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5 text-sm transition hover:bg-surface-hover"
            >
              <span className="font-medium text-fg">Message the platform team</span>
              <MegaphoneIcon className="h-4 w-4 text-fg-subtle" />
            </Link>
            <Link
              to="/seller/products/new"
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5 text-sm transition hover:bg-surface-hover"
            >
              <span className="font-medium text-fg">Add a product</span>
              <PackageIcon className="h-4 w-4 text-fg-subtle" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
