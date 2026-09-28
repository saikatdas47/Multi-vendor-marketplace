import { Route } from 'react-router-dom'

import AdminDashboard from '../../pages/admin/AdminDashboard'
import AdminInvoices from '../../pages/admin/AdminInvoices'
import AdminMessages from '../../pages/admin/AdminMessages'
import AdminNotices from '../../pages/admin/AdminNotices'
import SellerDetail from '../../pages/admin/SellerDetail'
import SellerList from '../../pages/admin/SellerList'
import SellerRequests from '../../pages/admin/SellerRequests'

/**
 * The admin panel. Still focused — approve sellers, bill them, talk to them.
 *
 * `/admin` is the overview rather than the approval queue now that there is
 * more than one thing needing attention: unconfirmed payments and unread
 * messages both compete with pending applications, and the overview links to
 * whichever is non-zero. The queue keeps its own route.
 */
export const adminRoutes = (
  <>
    <Route index element={<AdminDashboard />} />
    <Route path="requests" element={<SellerRequests />} />
    <Route path="sellers" element={<SellerList />} />
    <Route path="sellers/:id" element={<SellerDetail />} />
    <Route path="invoices" element={<AdminInvoices />} />
    <Route path="messages" element={<AdminMessages />} />
    <Route path="notices" element={<AdminNotices />} />
  </>
)
