import { Link } from 'react-router-dom'

import { config } from '../config'
import { SparkleIcon, ShieldIcon, StoreIcon, TruckIcon } from './icons'

/**
 * Split-screen wrapper for the auth pages.
 *
 * The marketing panel is `hidden lg:flex` — on a phone it would push the form
 * below the fold, which is the one thing an auth page must never do.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[calc(100dvh-8rem)] items-center gap-8 py-3 sm:py-6 lg:grid-cols-2 lg:gap-16">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm min-[380px]:p-5 sm:rounded-2xl sm:p-8">
          <h1 className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
          <div className="mt-5 sm:mt-7">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-fg-muted">{footer}</div>}
      </div>

      <div className="hidden lg:flex lg:flex-col">
        <div className="relative overflow-hidden rounded-2xl bg-brand-900 p-10 text-white">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(129,140,248,0.5),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(245,158,11,0.28),transparent_50%)]"
          />
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-sm font-black backdrop-blur">
                CX
              </span>
              <span className="text-lg font-bold tracking-tight">{config.appName}</span>
            </Link>

            <h2 className="mt-10 text-3xl font-bold leading-tight tracking-tight">
              A marketplace built like production software.
            </h2>
            <p className="mt-4 text-brand-100">
              Role-based access, atomic inventory, per-seller fulfilment and
              transactional checkout — not a shopping-cart demo.
            </p>

            <ul className="mt-9 space-y-4">
              {[
                { icon: ShieldUseIcon, text: 'JWT auth with refresh rotation and blacklisting' },
                { icon: TruckIcon, text: 'Stock locked and verified as orders are created' },
                { icon: StoreIcon, text: 'Independent seller storefronts and dashboards' },
                { icon: SparkleIcon, text: 'AI-assisted product copy and review summaries' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm text-brand-50">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/15 backdrop-blur">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// Aliased so the list above reads consistently.
const ShieldUseIcon = ShieldIcon
