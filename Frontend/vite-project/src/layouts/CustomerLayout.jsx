import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { config } from '../config'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { cn } from '../lib/cn'
import ChatWidget from '../components/ChatWidget'
import SmartSearch from '../components/SmartSearch'
import ThemeToggle from '../components/ThemeToggle'
import VerifyBanner from '../components/VerifyBanner'
import { Badge, Button } from '../components/ui'
import {
  CartIcon,
  CloseIcon,
  HeartIcon,
  MenuIcon,
  PackageIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  StoreIcon,
  TruckIcon,
  UserIcon,
} from '../components/icons'

/* ------------------------------------------------------------ account menu */

function AccountMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef(null)

  // Close on outside click and on Escape — a dropdown that only closes by
  // clicking the trigger again feels broken.
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

  const items = [
    { to: '/account', label: 'My account', icon: UserIcon },
    { to: '/orders', label: 'My orders', icon: PackageIcon },
    { to: '/wishlist', label: 'Wishlist', icon: HeartIcon },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg p-1 pr-2 text-sm transition hover:bg-surface-muted"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-xs font-bold text-white">
          {(user.first_name?.[0] || user.email[0]).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate font-medium text-fg lg:block">
          {user.first_name || user.email.split('@')[0]}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 animate-fade-up overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-3 pb-2.5 pt-2">
            <p className="truncate text-sm font-semibold text-fg">{user.full_name}</p>
            <p className="mb-2 truncate text-xs text-fg-subtle">{user.email}</p>
            <Badge tone="brand" size="sm">
              {user.role}
            </Badge>
          </div>

          {items.map(({ to, label, icon: ItemIcon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-fg-muted transition hover:bg-surface-muted hover:text-fg"
            >
              <ItemIcon className="h-4 w-4" />
              {label}
            </Link>
          ))}

          <div className="mt-1 border-t border-line pt-1">
            <button
              role="menuitem"
              onClick={async () => {
                await logout()
                setOpen(false)
                navigate('/')
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-danger-bg dark:text-red-400"
            >
              <CloseIcon className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- cart button */

function CartButton() {
  const { itemCount } = useCart()

  return (
    <Link
      to="/cart"
      aria-label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
      className="relative grid h-10 w-10 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-muted hover:text-fg"
    >
      <CartIcon />
      {itemCount > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-4.5 min-w-4.5 animate-fade-in place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-surface">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Link>
  )
}

/* ------------------------------------------------------------------ navbar */

const NAV_LINKS = [
  { to: '/products', label: 'Products' },
  { to: '/categories', label: 'Categories' },
  { to: '/shops', label: 'Shops' },
]

function Navbar() {
  const { isAuthenticated } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()

  // Any navigation should dismiss the mobile drawer.
  useEffect(() => {
    setMobileOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

  // Lock body scroll behind the drawer so the page doesn't move underneath.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const linkClass = ({ isActive }) =>
    cn(
      'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'text-brand-600 dark:text-brand-400' : 'text-fg-muted hover:text-fg',
    )

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="-ml-2 grid h-10 w-10 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-muted md:hidden"
          >
            <MenuIcon />
          </button>

          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-black text-white shadow-brand">
              CX
            </span>
            <span className="hidden text-lg font-bold tracking-tight text-fg sm:block">
              {config.appName}
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <SmartSearch className="mx-auto hidden w-full max-w-md lg:block" />

          <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search"
              className="grid h-10 w-10 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-muted hover:text-fg lg:hidden"
            >
              <SearchIcon />
            </button>

            <ThemeToggle />

            {isAuthenticated ? (
              <>
                <Link
                  to="/wishlist"
                  aria-label="Wishlist"
                  className="hidden h-10 w-10 place-items-center rounded-lg text-fg-muted transition hover:bg-surface-muted hover:text-fg sm:grid"
                >
                  <HeartIcon />
                </Link>
                <CartButton />
                <div className="ml-1">
                  <AccountMenu />
                </div>
              </>
            ) : (
              <div className="ml-1 flex items-center gap-2">
                <Button as={Link} to="/login" variant="ghost" size="sm">
                  Sign in
                </Button>
                <Button as={Link} to="/register" size="sm" className="hidden sm:inline-flex">
                  Get started
                </Button>
              </div>
            )}
          </div>
        </div>

        {searchOpen && (
          <div className="animate-fade-in border-t border-line px-4 py-3 lg:hidden">
            <SmartSearch autoFocus onNavigate={() => setSearchOpen(false)} />
          </div>
        )}
      </header>

      {/* ---------------------------------------------------- mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-lg">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <span className="font-bold tracking-tight text-fg">{config.appName}</span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="grid h-9 w-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted"
              >
                <CloseIcon />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-lg px-3 py-2.5 text-sm font-medium transition',
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}

              {isAuthenticated && (
                <>
                  <hr className="my-3 border-line" />
                  {[
                    { to: '/orders', label: 'My orders' },
                    { to: '/wishlist', label: 'Wishlist' },
                    { to: '/account', label: 'My account' },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="block rounded-lg px-3 py-2.5 text-sm text-fg-muted transition hover:bg-surface-muted hover:text-fg"
                    >
                      {item.label}
                    </Link>
                  ))}
                </>
              )}
            </nav>

            {!isAuthenticated && (
              <div className="grid gap-2 border-t border-line p-3">
                <Button as={Link} to="/register" className="w-full">
                  Create account
                </Button>
                <Button as={Link} to="/login" variant="secondary" className="w-full">
                  Sign in
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ footer */

function Footer() {
  const columns = [
    {
      title: 'Shop',
      links: [
        { to: '/products', label: 'All products' },
        { to: '/categories', label: 'Categories' },
        { to: '/shops', label: 'Browse shops' },
        { to: '/products?on_sale=true', label: 'On sale' },
        { to: '/products?is_featured=true', label: 'Featured' },
      ],
    },
    {
      title: 'Your account',
      links: [
        { to: '/account', label: 'Profile' },
        { to: '/orders', label: 'Orders & tracking' },
        { to: '/wishlist', label: 'Wishlist' },
        { to: '/cart', label: 'Cart' },
      ],
    },
    {
      title: 'Selling',
      links: [
        { to: '/register', label: 'Become a seller' },
        { to: '/shops', label: 'Shops on CommerceX' },
      ],
    },
  ]

  const assurances = [
    { icon: TruckIcon, label: 'Free delivery on every order' },
    { icon: ShieldIcon, label: 'Stock verified at checkout' },
    { icon: RefreshIcon, label: 'Cancel before dispatch' },
  ]

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      {/* Assurance strip. Repeating these at the bottom is not padding: the
          footer is where a hesitant shopper ends up before deciding. */}
      <div className="border-b border-line">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6 lg:px-8">
          {assurances.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-fg-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-black text-white">
                CX
              </span>
              <span className="text-lg font-bold tracking-tight text-fg">
                {config.appName}
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
              A multi-vendor marketplace where independent sellers reach customers
              with their own storefronts, inventory and fulfilment.
            </p>

            <Button
              as={Link}
              to="/register"
              size="sm"
              variant="secondary"
              className="mt-5"
            >
              <StoreIcon className="h-4 w-4" />
              Open your shop
            </Button>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-fg-subtle">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.to + link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-fg-muted transition hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-fg-subtle">
          <p>
            © {new Date().getFullYear()} {config.appName}. Portfolio project by Saikat Das.
          </p>

          <div className="flex flex-wrap items-center gap-5">
            {/* Plain anchors, not <Link>: these are served by Django, not the
                SPA router, so they need a real navigation. */}
            <a href="/api/docs/" className="transition hover:text-fg">
              API docs
            </a>
            <a href="/api/redoc/" className="transition hover:text-fg">
              ReDoc
            </a>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-1 transition hover:text-fg"
            >
              Back to top
              <span aria-hidden="true">↑</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ layout */

/** Resets scroll on navigation — SPAs keep the old offset by default. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export default function CustomerLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <Navbar />
      <VerifyBanner />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Outlet />
      </main>
      <Footer />
      {/* Available on every page — the assistant is the flagship feature, not
          something buried on one route. */}
      <ChatWidget />
    </div>
  )
}
