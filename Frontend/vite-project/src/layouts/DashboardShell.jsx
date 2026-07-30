import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import ThemeToggle from '../components/ThemeToggle'
import { CloseIcon, MenuIcon } from '../components/icons'
import { Badge } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/cn'

/**
 * Sidebar shell for the seller and admin dashboards.
 *
 * Shares nothing with the customer header: no product search, no cart, no
 * wishlist, no assistant. Those are not hidden behind a role check — this file
 * has no import path to them, which is what makes the separation structural.
 *
 * `nav` is `[{ section, items }]`, where an item is
 * `{ to, label, icon, end, badge }`. `badge` names a key on `badges`, so the
 * layout fetches counts once and the nav definition stays declarative.
 */

/** Longest matching nav item, so `/seller/products/new` still resolves. */
function currentItem(nav, pathname) {
  const items = nav.flatMap((group) => group.items)
  return items
    .filter((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]
}

function AccountMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click and Escape. A menu that only closes by re-clicking
  // its trigger feels broken.
  useEffect(() => {
    if (!open) return
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (user?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-surface-muted"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-xs font-semibold text-fg">
            {user?.email}
          </span>
          <span className="block text-[11px] capitalize text-fg-subtle">{user?.role}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 animate-fade-up overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-3 pb-2.5 pt-2">
            <p className="truncate text-sm font-semibold text-fg">
              {user?.full_name || user?.email}
            </p>
            <p className="mb-2 truncate text-xs text-fg-subtle">{user?.email}</p>
            <Badge tone="brand" size="sm">
              {user?.role}
            </Badge>
          </div>
          <button
            role="menuitem"
            onClick={logout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-danger-bg dark:text-red-400"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function DashboardShell({ title, nav, badges = {}, banner }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const active = currentItem(nav, location.pathname)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const sidebar = (
    <nav className="flex flex-col gap-5 p-3">
      {nav.map((group, index) => (
        <div key={group.section ?? `group-${index}`}>
          {group.section && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              {group.section}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const count = item.badge ? badges[item.badge] : 0
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      // A left rail plus a tinted background. Background alone
                      // reads as a hover state at a glance, which is why the
                      // active item was easy to lose in a nine-item sidebar.
                      'relative flex items-center gap-2.5 rounded-lg py-2 pl-4 pr-3 text-sm font-medium transition',
                      'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:transition-all',
                      isActive
                        ? 'bg-brand-50 text-brand-700 before:bg-brand-600 dark:bg-brand-950/50 dark:text-brand-300 dark:before:bg-brand-400'
                        : 'text-fg-muted before:bg-transparent hover:bg-surface-muted hover:text-fg',
                    )
                  }
                >
                  {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <Badge tone="brand" size="sm">
                      {count > 99 ? '99+' : count}
                    </Badge>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      {/* ---------------------------------------------------------- top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="-ml-2 grid h-10 w-10 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-muted lg:hidden"
          >
            <MenuIcon />
          </button>

          <Link to={nav[0]?.items[0]?.to ?? '/'} className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-black text-white shadow-brand">
              CX
            </span>
            <span className="hidden max-w-52 truncate text-base font-bold tracking-tight text-fg sm:block">
              {title}
            </span>
          </Link>

          {/* Where am I? On mobile the sidebar is hidden, so without this the
              only clue is the page's own heading below the fold. */}
          {active && (
            <>
              <span aria-hidden="true" className="hidden h-5 w-px bg-line-strong sm:block" />
              <span className="truncate text-sm font-medium text-fg-muted">
                {active.label}
              </span>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        {/* ------------------------------------------------- desktop sidebar */}
        <aside className="hidden w-60 shrink-0 self-start rounded-card border border-line bg-surface lg:block">
          {sidebar}
        </aside>

        {/* -------------------------------------------------- mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-overlay"
            />
            <div className="absolute inset-y-0 left-0 w-72 animate-fade-in overflow-y-auto bg-surface shadow-lg">
              <div className="flex h-16 items-center justify-between border-b border-line px-4">
                <span className="truncate text-base font-bold text-fg">{title}</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-muted"
                >
                  <CloseIcon />
                </button>
              </div>
              {sidebar}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- content */}
        <main id="dashboard-main" className="min-w-0 flex-1">
          {banner}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
