import client from './client'

/** Strips empty values so the query string stays clean. */
function clean(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== '' && v !== null && v !== undefined && v !== false,
    ),
  )
}

export const authApi = {
  register: (payload) => client.post('/auth/register/', payload).then((r) => r.data),
  login: (payload) => client.post('/auth/login/', payload).then((r) => r.data),
  logout: (refresh) => client.post('/auth/logout/', { refresh }),
  me: () => client.get('/auth/me/').then((r) => r.data),
  updateMe: (payload) => client.patch('/auth/me/', payload).then((r) => r.data),
  changePassword: (payload) =>
    client.post('/auth/change-password/', payload).then((r) => r.data),

  sendVerification: () => client.post('/auth/send-verification/').then((r) => r.data),
  verifyEmail: (token) =>
    client.post('/auth/verify-email/', { token }).then((r) => r.data),
  forgotPassword: (email) =>
    client.post('/auth/forgot-password/', { email }).then((r) => r.data),
  resetPassword: (payload) =>
    client.post('/auth/reset-password/', payload).then((r) => r.data),
}

export const aiApi = {
  /** Full listing: seo_title, description, bullets, meta_description. */
  draftListing: (payload) =>
    client.post('/ai/draft-listing/', payload).then((r) => r.data),

  /** Resolves to null on 204 — "no summary available" isn't an error. */
  reviewSummary: (slug) =>
    client.get(`/products/${slug}/ai-summary/`).then((r) => r.data || null),
}

export const assistantApi = {
  ask: ({ message, sessionId }) =>
    client
      .post('/assistant/ask/', {
        message,
        ...(sessionId ? { session_id: sessionId } : {}),
      })
      .then((r) => r.data),

  suggestions: () => client.get('/assistant/suggestions/').then((r) => r.data),

  /** Instant search. No LLM server-side, so it's safe to call while typing. */
  suggest: (q) =>
    client.get('/assistant/suggest/', { params: { q } }).then((r) => r.data),

  history: (sessionId) =>
    client.get(`/assistant/history/${sessionId}/`).then((r) => r.data),
}

export const catalogApi = {
  categories: (params) =>
    client.get('/categories/', { params: clean(params) }).then((r) => r.data),
  categoryTree: () => client.get('/categories/tree/').then((r) => r.data),

  products: (params) =>
    client.get('/products/', { params: clean(params) }).then((r) => r.data),
  product: (slug) => client.get(`/products/${slug}/`).then((r) => r.data),
  productReviews: (slug, params) =>
    client.get(`/products/${slug}/reviews/`, { params: clean(params) }).then((r) => r.data),

  createProduct: (payload) => client.post('/products/', payload).then((r) => r.data),
  updateProduct: (slug, payload) =>
    client.patch(`/products/${slug}/`, payload).then((r) => r.data),
  deleteProduct: (slug) => client.delete(`/products/${slug}/`),
  adjustStock: (slug, payload) =>
    client.post(`/products/${slug}/adjust-stock/`, payload).then((r) => r.data),
  lowStock: (params) =>
    client.get('/products/low-stock/', { params: clean(params) }).then((r) => r.data),
}

export const reviewApi = {
  create: (payload) => client.post('/reviews/', payload).then((r) => r.data),
  update: (id, payload) => client.patch(`/reviews/${id}/`, payload).then((r) => r.data),
  remove: (id) => client.delete(`/reviews/${id}/`),
  markHelpful: (id) => client.post(`/reviews/${id}/helpful/`).then((r) => r.data),
  mine: (params) => client.get('/reviews/', { params: clean(params) }).then((r) => r.data),
}

export const cartApi = {
  get: () => client.get('/cart/').then((r) => r.data),
  clear: () => client.delete('/cart/'),
  addItem: (payload) => client.post('/cart/items/', payload).then((r) => r.data),
  updateItem: (id, quantity) =>
    client.patch(`/cart/items/${id}/`, { quantity }).then((r) => r.data),
  removeItem: (id) => client.delete(`/cart/items/${id}/`).then((r) => r.data),
  resyncPrice: (id) => client.post(`/cart/items/${id}/resync-price/`).then((r) => r.data),
}

export const wishlistApi = {
  list: () => client.get('/wishlist/').then((r) => r.data),
  toggle: (productId) =>
    client.post('/wishlist/toggle/', { product: productId }).then((r) => r.data),
  remove: (id) => client.delete(`/wishlist/${id}/`),
  moveToCart: (id) => client.post(`/wishlist/${id}/move-to-cart/`).then((r) => r.data),
}

export const orderApi = {
  checkout: (payload) => client.post('/checkout/', payload).then((r) => r.data),
  list: (params) => client.get('/orders/', { params: clean(params) }).then((r) => r.data),
  get: (number) => client.get(`/orders/${number}/`).then((r) => r.data),
  cancel: (number, reason) =>
    client.post(`/orders/${number}/cancel/`, { reason }).then((r) => r.data),
}

export const sellerOrderApi = {
  items: (params) =>
    client.get('/seller/order-items/', { params: clean(params) }).then((r) => r.data),
  summary: () => client.get('/seller/order-items/summary/').then((r) => r.data),
  setStatus: (id, payload) =>
    client.post(`/seller/order-items/${id}/status/`, payload).then((r) => r.data),
}

export const profileApi = {
  addresses: () => client.get('/addresses/').then((r) => r.data),
  createAddress: (payload) => client.post('/addresses/', payload).then((r) => r.data),
  updateAddress: (id, payload) =>
    client.patch(`/addresses/${id}/`, payload).then((r) => r.data),
  deleteAddress: (id) => client.delete(`/addresses/${id}/`),
  seller: () => client.get('/profile/seller/').then((r) => r.data),
  updateSeller: (payload) => client.patch('/profile/seller/', payload).then((r) => r.data),
  uploadShopMedia: (kind, file) => {
    const body = new FormData()
    body.append('image', file)
    return client.post(`/profile/seller/media/${kind}/`, body).then((r) => r.data)
  },
  shops: (params) => client.get('/shops/', { params: clean(params) }).then((r) => r.data),
}

export const shopApi = {
  list: (params) => client.get('/shops/', { params: clean(params) }).then((r) => r.data),
  detail: (slug) => client.get(`/shops/${slug}/`).then((r) => r.data),
  // A shop's products come from the catalogue endpoint, which already filters on
  // seller__slug and brings pagination and ordering with it.
  products: (slug, params) =>
    client
      .get('/products/', { params: clean({ ...params, seller: slug }) })
      .then((r) => r.data),
}

export const noticeApi = {
  // --- seller side ---
  list: (params) =>
    client.get('/seller/notices/', { params: clean(params) }).then((r) => r.data),
  unreadCount: () => client.get('/seller/notices/unread-count/').then((r) => r.data),
  markRead: (id) => client.post(`/seller/notices/${id}/read/`).then((r) => r.data),
  markAllRead: () => client.post('/seller/notices/read-all/').then((r) => r.data),
}

export const adminNoticeApi = {
  list: (params) =>
    client.get('/admin/notices/', { params: clean(params) }).then((r) => r.data),
  send: (payload) => client.post('/admin/notices/send/', payload).then((r) => r.data),
}

export const billingApi = {
  // --- seller ---
  invoices: (params) =>
    client.get('/seller/invoices/', { params: clean(params) }).then((r) => r.data),
  feeSummary: () => client.get('/seller/invoices/summary/').then((r) => r.data),
  pay: (id, payment_reference) =>
    client.post(`/seller/invoices/${id}/pay/`, { payment_reference }).then((r) => r.data),
}

export const adminBillingApi = {
  invoices: (params) =>
    client.get('/admin/invoices/', { params: clean(params) }).then((r) => r.data),
  summary: () => client.get('/admin/invoices/summary/').then((r) => r.data),
  generate: (payload = {}) =>
    client.post('/admin/invoices/generate/', payload).then((r) => r.data),
  confirm: (id, note = '') =>
    client.post(`/admin/invoices/${id}/confirm/`, { note }).then((r) => r.data),
  waive: (id, note = '') =>
    client.post(`/admin/invoices/${id}/waive/`, { note }).then((r) => r.data),
}

export const messageApi = {
  // --- seller: one thread with the platform ---
  thread: () => client.get('/seller/thread/').then((r) => r.data),
  reply: (body) => client.post('/seller/thread/', { body }).then((r) => r.data),
  unreadCount: () => client.get('/seller/thread/unread-count/').then((r) => r.data),
}

export const adminMessageApi = {
  threads: (params) =>
    client.get('/admin/conversations/', { params: clean(params) }).then((r) => r.data),
  thread: (id) => client.get(`/admin/conversations/${id}/`).then((r) => r.data),
  unreadCount: () => client.get('/admin/conversations/unread-count/').then((r) => r.data),
  // Addressed by seller id so the admin can write first, before any thread exists.
  send: (sellerId, body) =>
    client.post(`/admin/sellers/${sellerId}/message/`, { body }).then((r) => r.data),
}

export const adminApi = {
  dashboard: () => client.get('/admin/dashboard/').then((r) => r.data),
  users: (params) => client.get('/admin/users/', { params: clean(params) }).then((r) => r.data),
  toggleUserActive: (id) =>
    client.post(`/admin/users/${id}/toggle_active/`).then((r) => r.data),
  sellers: (params) =>
    client.get('/admin/sellers/', { params: clean(params) }).then((r) => r.data),
  // AdminSellerViewSet is a ReadOnlyModelViewSet, so retrieve is already routed.
  seller: (id) => client.get(`/admin/sellers/${id}/`).then((r) => r.data),
  reviewSeller: (id, payload) =>
    client.post(`/admin/sellers/${id}/review/`, payload).then((r) => r.data),
  auditLogs: (params) =>
    client.get('/admin/audit-logs/', { params: clean(params) }).then((r) => r.data),
}
