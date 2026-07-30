import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { adminApi } from '../../api/endpoints'
import { Alert, Badge, Button, EmptyState, Skeleton, Textarea } from '../../components/ui'
import { CheckIcon, CloseIcon, InboxIcon } from '../../components/icons'
import { useToast } from '../../hooks/useToast'

function rows(data) {
  // The list endpoint is paginated but may be configured either way; accept both
  // shapes rather than guessing and rendering nothing.
  return Array.isArray(data) ? data : (data?.results ?? [])
}

function RequestCard({ seller, onDone }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const toast = useToast()

  const review = useMutation({
    mutationFn: (payload) => adminApi.reviewSeller(seller.id, payload),
    // A toast rather than an inline message: approving removes this card from
    // the queue, so anything rendered inside it unmounts before it can be read.
    onSuccess: (_data, payload) => {
      toast.success(
        payload.status === 'approved'
          ? `${seller.shop_name} approved. They can publish products now.`
          : `${seller.shop_name} rejected.`,
      )
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const approve = () => review.mutate({ status: 'approved' })
  const reject = () =>
    review.mutate({ status: 'rejected', rejection_reason: reason.trim() })

  return (
    <li className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/admin/sellers/${seller.id}`}
            className="truncate text-base font-semibold text-fg transition hover:text-brand-600 dark:hover:text-brand-400"
          >
            {seller.shop_name}
          </Link>
          <p className="mt-0.5 truncate text-sm text-fg-muted">{seller.email}</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-fg-muted sm:grid-cols-2">
            {seller.business_email && (
              <div className="flex gap-1.5">
                <dt className="text-fg-subtle">Business email</dt>
                <dd className="truncate text-fg">{seller.business_email}</dd>
              </div>
            )}
            {seller.business_phone && (
              <div className="flex gap-1.5">
                <dt className="text-fg-subtle">Phone</dt>
                <dd className="text-fg">{seller.business_phone}</dd>
              </div>
            )}
            {seller.tax_id && (
              <div className="flex gap-1.5">
                <dt className="text-fg-subtle">Tax ID</dt>
                <dd className="text-fg">{seller.tax_id}</dd>
              </div>
            )}
            <div className="flex gap-1.5">
              <dt className="text-fg-subtle">Applied</dt>
              <dd className="text-fg">
                {new Date(seller.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
        <Badge tone="amber">{seller.status}</Badge>
      </div>

      {seller.description && (
        <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-sm leading-relaxed text-fg-muted">
          {seller.description}
        </p>
      )}

      {review.isError && (
        <div className="mt-3">
          <Alert>{review.error.message}</Alert>
        </div>
      )}

      {rejecting ? (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this application being rejected? The seller will see this."
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={reject}
              loading={review.isPending}
              disabled={!reason.trim()}
            >
              Confirm rejection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2 border-t border-line pt-4">
          <Button size="sm" onClick={approve} loading={review.isPending}>
            <CheckIcon className="h-4 w-4" />
            Accept
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
            <CloseIcon className="h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
    </li>
  )
}

export default function SellerRequests() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-sellers', { status: 'pending' }],
    queryFn: () => adminApi.sellers({ status: 'pending' }),
  })

  // Invalidate both the queue and the list: approving moves a row between them,
  // and the sidebar badge reads the same query key as the queue.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-sellers'] })
    // The overview and the sidebar badge both read the dashboard aggregate.
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const pending = rows(data)

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Seller requests</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Applications waiting for a decision. Approving a shop lets it publish
          products and sends the seller a confirmation email.
        </p>
      </header>

      {isError && <Alert>{error.message}</Alert>}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : pending.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-6 w-6" />}
          title="Nothing waiting"
          description="New seller applications will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {pending.map((seller) => (
            <RequestCard key={seller.id} seller={seller} onDone={refresh} />
          ))}
        </ul>
      )}
    </div>
  )
}
