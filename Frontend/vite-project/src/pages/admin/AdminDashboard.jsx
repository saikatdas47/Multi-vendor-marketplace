import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { adminApi } from '../../api/endpoints'
import StatCard from '../../components/StatCard'
import {
  ClipboardIcon,
  InboxIcon,
  MegaphoneIcon,
  PackageIcon,
  StoreIcon,
} from '../../components/icons'
import { Alert, Badge, PageHeader } from '../../components/ui'
import { formatMoney } from '../../config'

export default function AdminDashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminApi.dashboard,
    refetchInterval: 60_000,
  })

  const shops = data?.shops ?? {}
  const fees = data?.fees ?? {}

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Platform health at a glance. Anything needing your attention is linked."
      />

      {isError && (
        <div className="mb-5">
          <Alert>{error.message}</Alert>
        </div>
      )}

      {/* Work queues first: these are the reasons an admin opens the panel. */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          Needs attention
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Seller requests"
            value={shops.pending}
            hint="Awaiting approval"
            tone={shops.pending > 0 ? 'warning' : 'neutral'}
            icon={InboxIcon}
            to="/admin"
            loading={isLoading}
          />
          <StatCard
            label="Payments to confirm"
            value={fees.awaiting_confirmation}
            hint="Sellers say they have paid"
            tone={fees.awaiting_confirmation > 0 ? 'warning' : 'neutral'}
            icon={ClipboardIcon}
            to="/admin/invoices?status=submitted"
            loading={isLoading}
          />
          <StatCard
            label="Overdue invoices"
            value={fees.overdue}
            hint="Past the due date"
            tone={fees.overdue > 0 ? 'danger' : 'success'}
            icon={ClipboardIcon}
            to="/admin/invoices?status=due"
            loading={isLoading}
          />
          <StatCard
            label="Unread messages"
            value={data?.unread_conversations}
            hint="From sellers"
            tone={data?.unread_conversations > 0 ? 'brand' : 'neutral'}
            icon={MegaphoneIcon}
            to="/admin/messages"
            loading={isLoading}
          />
        </div>
      </section>

      {/* Standing numbers: context, not tasks. */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          Platform
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active shops"
            value={shops.approved}
            hint={`${shops.total ?? 0} total registered`}
            icon={StoreIcon}
            to="/admin/sellers"
            loading={isLoading}
          />
          <StatCard
            label="Products listed"
            value={data?.products}
            icon={PackageIcon}
            loading={isLoading}
          />
          <StatCard
            label="Fees outstanding"
            value={formatMoney(fees.outstanding ?? 0)}
            hint="Due plus submitted"
            tone={fees.outstanding > 0 ? 'warning' : 'success'}
            to="/admin/invoices"
            loading={isLoading}
          />
          <StatCard
            label="Fees collected"
            value={formatMoney(fees.collected ?? 0)}
            hint="Confirmed received"
            tone="success"
            loading={isLoading}
          />
        </div>
      </section>

      {(shops.rejected > 0 || shops.suspended > 0) && (
        <section>
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Not trading
          </h2>
          <div className="flex flex-wrap gap-2">
            {shops.rejected > 0 && (
              <Link to="/admin/sellers?status=rejected">
                <Badge tone="rose">{shops.rejected} rejected</Badge>
              </Link>
            )}
            {shops.suspended > 0 && (
              <Link to="/admin/sellers?status=suspended">
                <Badge tone="rose">{shops.suspended} suspended</Badge>
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
