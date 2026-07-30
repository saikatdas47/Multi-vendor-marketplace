import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { homeFor } from '../lib/roles'
import { Spinner } from './ui'

function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8 text-brand-600 dark:text-brand-400" />
    </div>
  )
}

/** Requires a signed-in user, any role. */
export function RequireAuth() {
  const { isAuthenticated, booting } = useAuth()
  const location = useLocation()

  if (booting) return <FullPageSpinner />
  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <Outlet />
}

/**
 * Restricts a subtree to one role.
 *
 * A wrong-role user is sent to *their own* home, not to `/forbidden`. Someone
 * who bookmarked `/seller` before switching accounts made a navigation mistake,
 * not an attack, and a dead-end error page is a worse answer than their own
 * dashboard. `/forbidden` stays for the real case: a 403 from the API on a route
 * the user was otherwise entitled to open.
 *
 * Used as a layout element (`element={<RequireRole role="admin" />}`) so the
 * wrong role never paints the admin shell around a redirect.
 */
export function RequireRole({ role }) {
  const { isAuthenticated, booting, user } = useAuth()
  const location = useLocation()

  if (booting) return <FullPageSpinner />
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (user.role !== role) {
    return <Navigate to={homeFor(user.role)} replace />
  }
  return <Outlet />
}

/**
 * Keeps signed-in users off login and register.
 *
 * Redirects to the role's own home rather than `/`, which is what the previous
 * version did — that dropped an admin onto a storefront they have no access to.
 */
export function RequireAnonymous() {
  const { isAuthenticated, booting, user } = useAuth()

  if (booting) return <FullPageSpinner />
  if (isAuthenticated) return <Navigate to={homeFor(user?.role)} replace />
  return <Outlet />
}
