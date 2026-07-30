import { useQuery } from '@tanstack/react-query'

import {
  ChatIcon,
  CreditCardIcon,
  GridIcon,
  InboxIcon,
  MegaphoneIcon,
  StoreIcon,
} from '../components/icons'
import { adminApi } from '../api/endpoints'
import DashboardShell from './DashboardShell'

/**
 * Seven links across four groups. The panel stays focused on the platform's own
 * business: approving shops, billing them, and talking to them.
 *
 * No storefront, no cart, no wishlist, no assistant — and none of those are
 * reachable from here, because this module has no import path to them.
 */
const NAV = [
  {
    section: null,
    items: [{ to: '/admin', end: true, label: 'Overview', icon: GridIcon }],
  },
  {
    section: 'Sellers',
    items: [
      { to: '/admin/requests', label: 'Requests', icon: InboxIcon, badge: 'pending' },
      { to: '/admin/sellers', label: 'All sellers', icon: StoreIcon },
    ],
  },
  {
    section: 'Money',
    items: [
      {
        to: '/admin/invoices',
        label: 'Platform fees',
        icon: CreditCardIcon,
        badge: 'toConfirm',
      },
    ],
  },
  {
    section: 'Communication',
    items: [
      { to: '/admin/messages', label: 'Messages', icon: ChatIcon, badge: 'unread' },
      { to: '/admin/notices', label: 'Notices', icon: MegaphoneIcon },
    ],
  },
]

export default function AdminLayout() {
  // One request feeds every badge. The dashboard endpoint already aggregates
  // these counts, so the shell reuses it instead of firing three list calls
  // whose lengths it would then have to count.
  const { data } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminApi.dashboard,
    refetchInterval: 60_000,
    retry: false,
  })

  return (
    <DashboardShell
      title="CommerceX admin"
      nav={NAV}
      badges={{
        pending: data?.shops?.pending ?? 0,
        toConfirm: data?.fees?.awaiting_confirmation ?? 0,
        unread: data?.unread_conversations ?? 0,
      }}
    />
  )
}
