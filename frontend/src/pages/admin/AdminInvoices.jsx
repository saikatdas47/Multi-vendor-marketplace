import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { adminBillingApi } from '../../api/endpoints'
import DataState from '../../components/DataState'
import StatCard from '../../components/StatCard'
import { ClipboardIcon } from '../../components/icons'
import {
  Badge,
  Button,
  EmptyState,
  Money,
  PageHeader,
  Skeleton,
} from '../../components/ui'
import { formatMoney } from '../../config'
import { useToast } from '../../hooks/useToast'

const TABS = [
  { value: '', label: 'All' },
  { value: 'due', label: 'Due' },
  { value: 'submitted', label: 'To confirm' },
  { value: 'paid', label: 'Paid' },
  { value: 'waived', label: 'Waived' },
]

const TONE = { due: 'amber', submitted: 'brand', paid: 'green', waived: 'slate' }

function rows(data) {
  return Array.isArray(data) ? data : (data?.results ?? [])
}

export default function AdminInvoices() {
  // Status lives in the URL so the dashboard can deep-link "payments to confirm"
  // and the admin can bookmark or share a filtered view.
  const [params, setParams] = useSearchParams()
  const statusFilter = params.get('status') ?? ''
  const sellerFilter = params.get('seller') ?? ''

  const [busyId, setBusyId] = useState(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  const summary = useQuery({
    queryKey: ['admin-invoice-summary'],
    queryFn: adminBillingApi.summary,
  })

  const invoices = useQuery({
    queryKey: ['admin-invoices', { status: statusFilter, seller: sellerFilter }],
    queryFn: () =>
      adminBillingApi.invoices({ status: statusFilter, seller: sellerFilter }),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['admin-invoice-summary'] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const generate = useMutation({
    mutationFn: () => adminBillingApi.generate(),
    onSuccess: (data) => {
      // `already_existed` is the interesting number: it proves re-running is
      // safe, so say it rather than reporting a bare success.
      toast.success(
        data.created > 0
          ? `Raised ${data.created} invoice${data.created === 1 ? '' : 's'} for ${data.period}.`
          : `Nothing new — all ${data.already_existed} invoices for ${data.period} already exist.`,
      )
      refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const settle = useMutation({
    mutationFn: ({ id, action }) =>
      action === 'confirm' ? adminBillingApi.confirm(id) : adminBillingApi.waive(id),
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: (_data, { action, shop }) => {
      toast.success(
        action === 'confirm'
          ? `Payment from ${shop} confirmed.`
          : `Invoice for ${shop} waived.`,
      )
      refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const list = rows(invoices.data)
  const s = summary.data ?? {}

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Platform fees"
        subtitle="A flat monthly fee per shop, invoiced in arrears. Sellers declare a transfer reference; you confirm receipt."
        action={
          <Button size="sm" onClick={() => generate.mutate()} loading={generate.isPending}>
            Raise last month's invoices
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={formatMoney(s.outstanding ?? 0)}
          hint="Due plus submitted"
          tone={s.outstanding > 0 ? 'warning' : 'success'}
          loading={summary.isLoading}
        />
        <StatCard
          label="Awaiting confirmation"
          value={formatMoney(s.submitted ?? 0)}
          hint="Sellers say they have paid"
          tone={s.submitted > 0 ? 'brand' : 'neutral'}
          loading={summary.isLoading}
        />
        <StatCard
          label="Overdue"
          value={s.overdue ?? 0}
          hint="Invoices past due date"
          tone={s.overdue > 0 ? 'danger' : 'success'}
          loading={summary.isLoading}
        />
        <StatCard
          label="Collected"
          value={formatMoney(s.paid ?? 0)}
          tone="success"
          loading={summary.isLoading}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter('status', tab.value)}
              className={
                statusFilter === tab.value
                  ? 'rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-md px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:bg-surface-muted hover:text-fg'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        {sellerFilter && (
          <Button size="xs" variant="ghost" onClick={() => setFilter('seller', '')}>
            Clear shop filter
          </Button>
        )}
      </div>

      <DataState
        isLoading={invoices.isLoading}
        isError={invoices.isError}
        error={invoices.error}
        isEmpty={list.length === 0}
        skeleton={<Skeleton className="h-64" />}
        empty={
          <EmptyState
            icon={<ClipboardIcon className="h-6 w-6" />}
            title={statusFilter ? 'No invoices with that status' : 'No invoices yet'}
            description={
              statusFilter
                ? 'Try a different filter.'
                : "Use “Raise last month's invoices” to bill approved shops."
            }
          />
        }
      >
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left">
              <tr className="text-xs uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-3 font-semibold">Shop</th>
                <th className="px-4 py-3 font-semibold">Period</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((invoice) => (
                <tr key={invoice.id} className="transition hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/sellers/${invoice.seller_id}`}
                      className="font-medium text-fg hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {invoice.shop_name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                    {invoice.period_label}
                  </td>
                  <td className="px-4 py-3">
                    <Money amount={invoice.amount} className="font-semibold text-fg" />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={invoice.is_overdue ? 'rose' : (TONE[invoice.status] ?? 'slate')}>
                      {invoice.is_overdue ? 'overdue' : invoice.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    {invoice.payment_reference || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {!invoice.is_settled && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="xs"
                          loading={settle.isPending && busyId === invoice.id}
                          onClick={() =>
                            settle.mutate({
                              id: invoice.id,
                              action: 'confirm',
                              shop: invoice.shop_name,
                            })
                          }
                        >
                          Confirm
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            settle.mutate({
                              id: invoice.id,
                              action: 'waive',
                              shop: invoice.shop_name,
                            })
                          }
                        >
                          Waive
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  )
}
