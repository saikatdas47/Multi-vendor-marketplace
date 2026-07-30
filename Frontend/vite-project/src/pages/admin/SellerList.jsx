import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { adminApi } from '../../api/endpoints'
import {
  Alert,
  Badge,
  EmptyState,
  Input,
  Skeleton,
  Thumb,
} from '../../components/ui'
import { StoreIcon } from '../../components/icons'
import { useDebounce } from '../../hooks/useDebounce'

const TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_TONE = {
  approved: 'green',
  pending: 'amber',
  rejected: 'rose',
  suspended: 'rose',
}

function rows(data) {
  return Array.isArray(data) ? data : (data?.results ?? [])
}

export default function SellerList() {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-sellers', { status, search: debounced }],
    queryFn: () => adminApi.sellers({ status, search: debounced }),
  })

  const sellers = rows(data)

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Sellers</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Every shop on the platform and its current status.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={
                status === tab.value
                  ? 'rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-md px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:bg-surface-muted hover:text-fg'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shop name or email"
          className="max-w-xs"
        />
      </div>

      {isError && <Alert>{error.message}</Alert>}

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : sellers.length === 0 ? (
        <EmptyState
          icon={<StoreIcon className="h-6 w-6" />}
          title="No sellers found"
          description={
            debounced || status
              ? 'Try a different search or status filter.'
              : 'Shops will appear here once sellers register.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left">
              <tr className="text-xs uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-3 font-semibold">Shop</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sellers.map((seller) => (
                <tr key={seller.id} className="transition hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Thumb
                        src={seller.logo}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-lg"
                      />
                      <Link
                        to={`/admin/sellers/${seller.id}`}
                        className="font-medium text-fg transition hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        {seller.shop_name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {seller.business_email || seller.email}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[seller.status] ?? 'slate'}>
                      {seller.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {new Date(seller.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
