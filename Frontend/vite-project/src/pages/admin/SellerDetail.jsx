import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  adminApi,
  adminBillingApi,
  adminMessageApi,
  catalogApi,
} from '../../api/endpoints'
import DataState from '../../components/DataState'
import { CheckIcon, CloseIcon, MegaphoneIcon, PackageIcon } from '../../components/icons'
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  EmptyState,
  Money,
  Skeleton,
  Textarea,
  Thumb,
} from '../../components/ui'
import { useToast } from '../../hooks/useToast'

const STATUS_TONE = {
  approved: 'green',
  pending: 'amber',
  rejected: 'rose',
  suspended: 'rose',
}

const INVOICE_TONE = {
  due: 'amber',
  submitted: 'brand',
  paid: 'green',
  waived: 'slate',
}

function rows(data) {
  return Array.isArray(data) ? data : (data?.results ?? [])
}

/* --------------------------------------------------- message this seller */

function MessageBox({ seller }) {
  const [body, setBody] = useState('')
  const toast = useToast()
  const queryClient = useQueryClient()

  const send = useMutation({
    mutationFn: () => adminMessageApi.send(seller.id, body.trim()),
    onSuccess: () => {
      setBody('')
      toast.success(`Message sent to ${seller.shop_name}.`)
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
        <MegaphoneIcon className="h-4 w-4" />
        Message this seller
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Goes to their dashboard inbox. They can reply, and the thread continues in{' '}
        <Link to="/admin/messages" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
          Messages
        </Link>
        .
      </p>

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim() && !send.isPending) send.mutate()
        }}
      >
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Write to ${seller.shop_name}…`}
        />
        <Button type="submit" size="sm" disabled={!body.trim()} loading={send.isPending}>
          Send message
        </Button>
      </form>
    </section>
  )
}

/* ------------------------------------------------------------- approval */

function ApprovalActions({ seller, onDone }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const toast = useToast()

  const review = useMutation({
    mutationFn: (payload) => adminApi.reviewSeller(seller.id, payload),
    onSuccess: (_data, payload) => {
      toast.success(
        payload.status === 'approved'
          ? `${seller.shop_name} approved. They can publish products now.`
          : `${seller.shop_name} rejected.`,
      )
      setRejecting(false)
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  if (seller.status !== 'pending') return null

  return (
    <div className="rounded-card border border-warning-line surface-warning p-4">
      <p className="text-sm font-semibold">This application is waiting for a decision.</p>

      {rejecting ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being rejected? The seller will see this."
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={!reason.trim()}
              loading={review.isPending}
              onClick={() => review.mutate({ status: 'rejected', rejection_reason: reason.trim() })}
            >
              Confirm rejection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            loading={review.isPending}
            onClick={() => review.mutate({ status: 'approved' })}
          >
            <CheckIcon className="h-4 w-4" />
            Accept
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
            <CloseIcon className="h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function SellerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const seller = useQuery({
    queryKey: ['admin-seller', id],
    queryFn: () => adminApi.seller(id),
    retry: false,
  })

  // The public catalogue endpoint already filters by shop slug, so the admin
  // reuses it rather than needing a private mirror of the product list.
  const products = useQuery({
    queryKey: ['admin-seller-products', seller.data?.slug],
    queryFn: () => catalogApi.products({ seller: seller.data.slug, page_size: 6 }),
    enabled: Boolean(seller.data?.slug),
  })

  const invoices = useQuery({
    queryKey: ['admin-invoices', { seller: id }],
    queryFn: () => adminBillingApi.invoices({ seller: id }),
    enabled: Boolean(id),
  })

  if (seller.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (seller.isError) {
    return (
      <div className="space-y-4">
        <Alert>{seller.error.message}</Alert>
        <Button variant="secondary" size="sm" onClick={() => navigate('/admin/sellers')}>
          Back to sellers
        </Button>
      </div>
    )
  }

  const shop = seller.data
  const productRows = rows(products.data)
  const invoiceRows = rows(invoices.data)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Sellers', to: '/admin/sellers' }, { label: shop.shop_name }]}
      />

      {/* ------------------------------------------------------------ header */}
      <header className="rounded-card border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Thumb src={shop.logo} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-fg">
                {shop.shop_name}
              </h1>
              <p className="truncate text-sm text-fg-muted">{shop.email}</p>
            </div>
          </div>
          <Badge tone={STATUS_TONE[shop.status] ?? 'slate'}>{shop.status}</Badge>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Business email', shop.business_email],
            ['Phone', shop.business_phone],
            ['Tax ID', shop.tax_id],
            ['Commission', shop.commission_rate ? `${shop.commission_rate}%` : null],
            ['Applied', new Date(shop.created_at).toLocaleDateString()],
            [
              'Approved',
              shop.approved_at ? new Date(shop.approved_at).toLocaleDateString() : null,
            ],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-fg-subtle">{label}</dt>
                <dd className="text-fg">{value}</dd>
              </div>
            ))}
        </dl>

        {shop.rejection_reason && (
          <div className="mt-4">
            <Alert>{shop.rejection_reason}</Alert>
          </div>
        )}
      </header>

      <ApprovalActions
        seller={shop}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-seller', id] })
          queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
          queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
        }}
      />

      <MessageBox seller={shop} />

      {/* ---------------------------------------------------------- invoices */}
      <section className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-fg">Platform fees</h2>
          <Link
            to={`/admin/invoices?seller=${shop.id}`}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Manage
          </Link>
        </div>

        <DataState
          isLoading={invoices.isLoading}
          isError={invoices.isError}
          error={invoices.error}
          isEmpty={invoiceRows.length === 0}
          skeleton={<Skeleton className="h-20" />}
          empty={
            <p className="text-sm text-fg-muted">
              No invoices raised for this shop yet.
            </p>
          }
        >
          <ul className="divide-y divide-line">
            {invoiceRows.slice(0, 6).map((invoice) => (
              <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{invoice.period_label}</p>
                  <p className="text-xs text-fg-subtle">
                    Due {new Date(invoice.due_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Money amount={invoice.amount} className="text-sm font-semibold text-fg" />
                  <Badge tone={INVOICE_TONE[invoice.status] ?? 'slate'}>
                    {invoice.is_overdue ? 'overdue' : invoice.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </DataState>
      </section>

      {/* ---------------------------------------------------------- products */}
      <section className="rounded-card border border-line bg-surface p-5">
        <h2 className="mb-3 text-base font-semibold text-fg">Products</h2>

        <DataState
          isLoading={products.isLoading}
          isError={products.isError}
          error={products.error}
          isEmpty={productRows.length === 0}
          skeleton={<Skeleton className="h-24" />}
          empty={
            <EmptyState
              icon={<PackageIcon className="h-6 w-6" />}
              title="No published products"
              description="This shop has not listed anything yet."
            />
          }
        >
          <ul className="divide-y divide-line">
            {productRows.map((product) => (
              <li key={product.id} className="flex items-center gap-3 py-2.5">
                <Thumb
                  src={product.primary_image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{product.name}</p>
                  <p className="text-xs text-fg-subtle">
                    {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                  </p>
                </div>
                <Money amount={product.price} className="text-sm font-semibold text-fg" />
              </li>
            ))}
          </ul>
        </DataState>
      </section>
    </div>
  )
}
