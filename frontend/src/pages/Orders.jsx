import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { orderApi } from '../api/endpoints'
import { STATUS_LABEL, StatusBadge } from '../components/OrderStatus'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Money,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Thumb,
} from '../components/ui'
import { ChevronRightIcon, PackageIcon, SearchIcon } from '../components/icons'
import { useDebounce } from '../hooks/useDebounce'

export default function Orders() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search)

  const { data, isPending } = useQuery({
    queryKey: ['orders', { debounced, statusFilter, page }],
    queryFn: () => orderApi.list({ q: debounced, status: statusFilter, page }),
    placeholderData: keepPreviousData,
  })

  const orders = data?.results ?? []
  const filtering = Boolean(statusFilter || debounced)

  return (
    <div>
      <PageHeader
        title="My orders"
        subtitle="Track deliveries and revisit everything you've bought."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="min-w-52 flex-1 sm:max-w-xs">
          <Input
            type="search"
            placeholder="Order number or product…"
            aria-label="Search orders"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            leading={<SearchIcon className="h-4 w-4" />}
          />
        </div>
        <Select
          className="w-auto min-w-44"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      {isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="h-6 w-6" />}
          title={filtering ? 'No matching orders' : 'No orders yet'}
          description={
            filtering
              ? 'Try clearing the search or status filter.'
              : 'When you place an order it will appear here with live tracking.'
          }
          action={
            filtering ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('')
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button as={Link} to="/products">Start shopping</Button>
            )
          }
        />
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li key={order.id}>
              <Card
                as={Link}
                to={`/orders/${order.number}`}
                className="group block transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
              >
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <Thumb
                    src={order.first_image}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg border border-line"
                  />

                  <div className="min-w-44 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-fg">
                        {order.number}
                      </span>
                      <StatusBadge status={order.status} label={order.status_display} size="sm" />
                      {order.payment_status === 'unpaid' && (
                        <Badge tone="amber" size="sm">Unpaid</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {new Date(order.placed_at).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {' · '}
                      {order.item_count} item{order.item_count === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 truncate text-xs text-fg-muted">
                      {order.seller_names.join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <Money amount={order.total} size="md" className="font-bold text-fg" />
                    <ChevronRightIcon className="h-5 w-5 text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onChange={setPage} />
    </div>
  )
}
