import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { billingApi } from '../../api/endpoints'
import DataState from '../../components/DataState'
import StatCard from '../../components/StatCard'
import { ClipboardIcon } from '../../components/icons'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Money,
  PageHeader,
  Skeleton,
} from '../../components/ui'
import { formatMoney } from '../../config'
import { useToast } from '../../hooks/useToast'

const TONE = { due: 'amber', submitted: 'brand', paid: 'green', waived: 'slate' }

function rows(data) {
  return Array.isArray(data) ? data : (data?.results ?? [])
}

function PayForm({ invoice, onDone }) {
  const [reference, setReference] = useState('')
  const toast = useToast()

  const pay = useMutation({
    mutationFn: () => billingApi.pay(invoice.id, reference.trim()),
    onSuccess: () => {
      toast.success(
        `Reference recorded for ${invoice.period_label}. The platform will confirm it.`,
      )
      setReference('')
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <form
      className="mt-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (reference.trim().length >= 4 && !pay.isPending) pay.mutate()
      }}
    >
      <Field
        label="Transfer reference"
        htmlFor={`ref-${invoice.id}`}
        hint="Send the transfer, then record its reference here. The platform confirms it separately."
      >
        <div className="flex gap-2">
          <Input
            id={`ref-${invoice.id}`}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. TRX-48210"
            className="flex-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={reference.trim().length < 4}
            loading={pay.isPending}
          >
            I have paid
          </Button>
        </div>
      </Field>
    </form>
  )
}

export default function SellerBilling() {
  const queryClient = useQueryClient()

  const summary = useQuery({
    queryKey: ['seller-fee-summary'],
    queryFn: billingApi.feeSummary,
  })

  const invoices = useQuery({
    queryKey: ['seller-invoices'],
    queryFn: () => billingApi.invoices(),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['seller-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['seller-fee-summary'] })
  }

  const list = rows(invoices.data)
  const s = summary.data ?? {}
  const overdue = list.filter((i) => i.is_overdue)

  return (
    <div>
      <PageHeader
        title="Platform fees"
        subtitle="A flat monthly fee for selling on CommerceX, billed in arrears for the month just finished."
      />

      {overdue.length > 0 && (
        <div className="mb-5">
          <Alert tone="error" title="You have an overdue invoice">
            {overdue.length === 1
              ? `${overdue[0].period_label} was due on ${new Date(overdue[0].due_date).toLocaleDateString()}.`
              : `${overdue.length} invoices are past their due date.`}{' '}
            Your shop keeps trading, but please settle this.
          </Alert>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={formatMoney(s.outstanding ?? 0)}
          hint="Unpaid plus awaiting confirmation"
          tone={s.outstanding > 0 ? 'warning' : 'success'}
          loading={summary.isLoading}
        />
        <StatCard
          label="Next due"
          value={s.next_due ? formatMoney(s.next_due.amount) : '—'}
          hint={
            s.next_due
              ? `${s.next_due.period_label}, due ${new Date(s.next_due.due_date).toLocaleDateString()}`
              : 'Nothing outstanding'
          }
          tone={s.next_due ? 'brand' : 'success'}
          loading={summary.isLoading}
        />
        <StatCard
          label="Paid to date"
          value={formatMoney(s.paid ?? 0)}
          tone="success"
          loading={summary.isLoading}
        />
      </div>

      <DataState
        isLoading={invoices.isLoading}
        isError={invoices.isError}
        error={invoices.error}
        isEmpty={list.length === 0}
        skeleton={<Skeleton className="h-40" />}
        empty={
          <EmptyState
            icon={<ClipboardIcon className="h-6 w-6" />}
            title="No invoices yet"
            description="Your first platform fee is raised at the start of the month after you are approved."
          />
        }
      >
        <ul className="space-y-3">
          {list.map((invoice) => (
            <li
              key={invoice.id}
              className={
                invoice.is_overdue
                  ? 'rounded-card border border-danger-line bg-surface p-5'
                  : 'rounded-card border border-line bg-surface p-5'
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-fg">{invoice.period_label}</h2>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    Due {new Date(invoice.due_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Money amount={invoice.amount} size="md" className="font-bold text-fg" />
                  <Badge tone={invoice.is_overdue ? 'rose' : (TONE[invoice.status] ?? 'slate')}>
                    {invoice.is_overdue ? 'overdue' : invoice.status}
                  </Badge>
                </div>
              </div>

              {invoice.status === 'submitted' && (
                <p className="mt-2 text-sm text-fg-muted">
                  Reference{' '}
                  <span className="font-mono text-xs text-fg">
                    {invoice.payment_reference}
                  </span>{' '}
                  recorded — waiting for the platform to confirm.
                </p>
              )}

              {invoice.status === 'paid' && invoice.paid_at && (
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
                  Confirmed on {new Date(invoice.paid_at).toLocaleDateString()}.
                </p>
              )}

              {invoice.status === 'waived' && (
                <p className="mt-2 text-sm text-fg-muted">
                  Waived by the platform{invoice.note ? ` — ${invoice.note}` : '.'}
                </p>
              )}

              {invoice.status === 'due' && <PayForm invoice={invoice} onDone={refresh} />}
            </li>
          ))}
        </ul>
      </DataState>
    </div>
  )
}
