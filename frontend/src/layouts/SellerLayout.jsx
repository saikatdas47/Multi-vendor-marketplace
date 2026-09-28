import { useQuery } from '@tanstack/react-query'

import {
  ChatIcon,
  CreditCardIcon,
  GridIcon,
  LayersIcon,
  MegaphoneIcon,
  PackageIcon,
  SettingsIcon,
  StoreIcon,
  TruckIcon,
} from '../components/icons'
import { Alert } from '../components/ui'
import { billingApi, messageApi, noticeApi, profileApi } from '../api/endpoints'
import DashboardShell from './DashboardShell'

const NAV = [
  {
    section: null,
    items: [
      { to: '/seller', end: true, label: 'My products', icon: PackageIcon },
      { to: '/seller/dashboard', label: 'Overview', icon: GridIcon },
    ],
  },
  {
    section: 'Shop',
    items: [
      { to: '/seller/inventory', label: 'Inventory', icon: LayersIcon },
      { to: '/seller/store', label: 'Shop profile', icon: SettingsIcon },
      { to: '/seller/preview', label: 'View my shop', icon: StoreIcon },
    ],
  },
  {
    section: 'Sales',
    items: [{ to: '/seller/orders', label: 'Orders & delivery', icon: TruckIcon }],
  },
  {
    section: 'Account',
    items: [
      {
        to: '/seller/billing',
        label: 'Platform fees',
        icon: CreditCardIcon,
        badge: 'unpaid',
      },
      {
        to: '/seller/messages',
        label: 'Messages',
        icon: ChatIcon,
        badge: 'messages',
      },
      {
        to: '/seller/notices',
        label: 'Admin notices',
        icon: MegaphoneIcon,
        badge: 'notices',
      },
    ],
  },
]

const STATUS_MESSAGE = {
  pending:
    'Your shop is awaiting admin approval. You can prepare products now, but they will not appear in the marketplace until you are approved.',
  rejected: 'Your shop application was not approved.',
  suspended: 'Your shop is currently suspended.',
}

export default function SellerLayout() {
  const { data: profile } = useQuery({
    queryKey: ['seller-profile'],
    queryFn: profileApi.seller,
  })

  // Three small polled counts rather than a push channel. A notice is not
  // time-critical, and a 60s interval costs three cheap queries where
  // websockets would cost a whole transport layer.
  const { data: notices } = useQuery({
    queryKey: ['seller-notice-unread'],
    queryFn: noticeApi.unreadCount,
    refetchInterval: 60_000,
    retry: false,
  })

  const { data: messages } = useQuery({
    queryKey: ['seller-thread-unread'],
    queryFn: messageApi.unreadCount,
    refetchInterval: 60_000,
    retry: false,
  })

  const { data: fees } = useQuery({
    queryKey: ['seller-fee-summary'],
    queryFn: billingApi.feeSummary,
    refetchInterval: 300_000,
    retry: false,
  })

  // Count invoices needing action, not currency. A badge showing "58" next to
  // "Platform fees" reads as 58 items, not 58 dollars.
  const unpaid = fees?.next_due ? 1 : 0
  const overdue = fees?.overdue ?? 0

  const banner = (
    <>
      {profile && !profile.is_approved && (
        <div className="mb-5">
          <Alert tone={profile.status === 'pending' ? 'warning' : 'error'}>
            {profile.rejection_reason ||
              STATUS_MESSAGE[profile.status] ||
              'Your shop is not currently active.'}
          </Alert>
        </div>
      )}

      {overdue > 0 && (
        <div className="mb-5">
          <Alert tone="error" title="Platform fee overdue">
            Your shop keeps trading, but please settle it on the Platform fees page.
          </Alert>
        </div>
      )}
    </>
  )

  return (
    <DashboardShell
      title={profile?.shop_name || 'Seller'}
      nav={NAV}
      badges={{
        notices: notices?.unread ?? 0,
        messages: messages?.unread ?? 0,
        unpaid: overdue || unpaid,
      }}
      banner={banner}
    />
  )
}
