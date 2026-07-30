/**
 * Where each role lives.
 *
 * One map, imported by the guards, the login redirect and the 403 page. When
 * these lived inline in three places they drifted — the old `RequireAnonymous`
 * sent every signed-in user to `/`, which dropped an admin onto a storefront
 * they are not allowed to see.
 */
export const HOME_FOR = {
  admin: '/admin',
  seller: '/seller',
  customer: '/',
}

export function homeFor(role) {
  return HOME_FOR[role] ?? '/'
}

/**
 * Route prefixes that belong to exactly one role.
 *
 * Used to decide whether a remembered `?next=` destination is worth honouring
 * after login. Without this check, a customer bounced off `/seller` would be
 * sent straight back to `/seller` the moment they signed in, and bounce again.
 */
const OWNED_PREFIXES = [
  { prefix: '/admin', role: 'admin' },
  { prefix: '/seller', role: 'seller' },
]

/** Customer-only paths. Public catalogue routes are deliberately absent. */
const CUSTOMER_ONLY = /^\/(cart|checkout|orders|wishlist|account)(\/|$)/

export function canRoleVisit(role, pathname) {
  if (!pathname) return false
  for (const { prefix, role: owner } of OWNED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return role === owner
    }
  }
  if (CUSTOMER_ONLY.test(pathname)) return role === 'customer'
  // Public catalogue: fine for a customer, but a seller or admin has no
  // storefront at all, so send them to their own dashboard instead.
  return role === 'customer'
}
