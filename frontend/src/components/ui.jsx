/**
 * UI primitives.
 *
 * Every component styles itself from the semantic tokens in index.css
 * (`bg-surface`, `text-fg-muted`, `border-line`, …) rather than raw palette
 * classes like `bg-white` or `text-slate-500`. That is the whole reason dark
 * mode needed no per-component work: reassigning the tokens reskins the app.
 */

import { forwardRef } from 'react'
import { Link } from 'react-router-dom'

import { formatMoney } from '../config'
import { cn } from '../lib/cn'

/* ----------------------------------------------------------------- button */

const BUTTON_VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 ' +
    'disabled:hover:bg-brand-600',
  secondary:
    'bg-surface text-fg ring-1 ring-inset ring-line-strong shadow-xs ' +
    'hover:bg-surface-hover hover:ring-fg-subtle',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800',
  accent:
    'bg-accent-500 text-slate-900 shadow-xs hover:bg-accent-400 active:bg-accent-600',
  link: 'text-brand-600 dark:text-brand-400 underline-offset-4 hover:underline p-0',

  // For dark surfaces — the hero, an inverted panel. These exist as variants
  // because passing `className="bg-white"` does NOT reliably win: `cn` only
  // joins strings, and which of two background utilities applies is decided by
  // their order in Tailwind's generated stylesheet, not by the order they appear
  // in the class attribute. The override silently lost, and "Start shopping"
  // rendered brand-on-brand.
  inverse:
    'bg-white text-brand-900 shadow-lg hover:bg-brand-50 active:bg-brand-100',
  glass:
    'bg-white/10 text-white ring-1 ring-inset ring-white/25 backdrop-blur ' +
    'hover:bg-white/20 active:bg-white/25',
}

const BUTTON_SIZES = {
  xs: 'h-7 gap-1 px-2.5 text-xs',
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
  icon: 'h-10 w-10',
}

export const Button = forwardRef(function Button(
  {
    as: Component = 'button',
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    className,
    children,
    ...props
  },
  ref,
) {
  const inert = disabled || loading

  return (
    <Component
      ref={ref}
      // `aria-disabled` matters when rendered `as={Link}` — anchors ignore
      // `disabled`, so without this a "disabled" link is still clickable.
      disabled={Component === 'button' ? inert : undefined}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center',
        'rounded-lg font-semibold whitespace-nowrap',
        'transition-[background-color,box-shadow,transform,color] duration-150 ease-out-soft',
        'active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100',
        inert && 'pointer-events-none opacity-50',
        BUTTON_VARIANTS[variant],
        variant !== 'link' && BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </Component>
  )
})

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3.2A4.8 4.8 0 0 0 7.2 12H4z"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ card */

export function Card({ as: Component = 'div', className, children, ...props }) {
  return (
    <Component
      className={cn(
        'rounded-card border border-line bg-surface shadow-xs',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

/* ----------------------------------------------------------------- fields */

export function Field({
  label,
  error,
  hint,
  required,
  labelAction,
  htmlFor,
  children,
}) {
  return (
    <div className="w-full">
      {(label || labelAction) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label
            htmlFor={htmlFor}
            className="text-sm font-medium text-fg"
          >
            {label}
            {required && (
              <span aria-hidden="true" className="ml-0.5 text-red-600 dark:text-red-400">
                *
              </span>
            )}
          </label>
          {labelAction}
        </div>
      )}
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

const CONTROL_BASE =
  'w-full rounded-lg bg-surface px-3 text-sm text-fg shadow-xs ' +
  'ring-1 ring-inset ring-line-strong ' +
  'placeholder:text-fg-subtle ' +
  'transition-[box-shadow,background-color] duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle'

export const Input = forwardRef(function Input(
  { className, invalid = false, leading, trailing, ...props },
  ref,
) {
  const control = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'h-10',
        invalid && 'ring-red-400 focus:ring-red-500',
        leading && 'pl-9',
        trailing && 'pr-9',
        className,
      )}
      {...props}
    />
  )

  if (!leading && !trailing) return control

  return (
    <div className="relative">
      {leading && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
          {leading}
        </span>
      )}
      {control}
      {trailing && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
          {trailing}
        </span>
      )}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea(
  { className, invalid = false, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'resize-y py-2.5 leading-relaxed',
        invalid && 'ring-red-400 focus:ring-red-500',
        className,
      )}
      {...props}
    />
  )
})

export const Select = forwardRef(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          CONTROL_BASE,
          'h-10 cursor-pointer appearance-none pr-9',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  )
})

export function Checkbox({ label, description, className, ...props }) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 text-sm',
        className,
      )}
    >
      {/* `accent-brand-600`, not `text-brand-600`. A native checkbox takes its
          tick colour from CSS `accent-color`; `text-*` only reaches it via
          @tailwindcss/forms, which this project doesn't install — so the
          checkbox was rendering in the browser's default blue the whole time
          while the class looked correct. */}
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong
                   bg-surface accent-brand-600 transition
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        {...props}
      />
      <span className="min-w-0">
        <span className="block font-medium text-fg group-hover:text-brand-600 dark:group-hover:text-brand-400">
          {label}
        </span>
        {description && (
          <span className="block text-xs text-fg-subtle">{description}</span>
        )}
      </span>
    </label>
  )
}

/** Radio rendered as a selectable card — used for addresses and payment. */
export function RadioCard({ checked, name, onChange, children, className }) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer gap-3 rounded-xl border p-4 transition-all duration-150 ease-out-soft',
        checked
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-950/40'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-hover',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer border-line-strong accent-brand-600
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </label>
  )
}

/* ----------------------------------------------------------------- status */

const ALERT_TONES = {
  error: 'bg-danger-bg text-danger-fg border-danger-line',
  success: 'bg-success-bg text-success-fg border-success-line',
  warning: 'bg-warning-bg text-warning-fg border-warning-line',
  info: 'bg-info-bg text-info-fg border-info-line',
}

const ALERT_ICONS = {
  error: 'M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z',
  success: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-3.7-2.3a1 1 0 0 0-1.4-1.4L9 10.2 7.1 8.3a1 1 0 0 0-1.4 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6z',
  warning: 'M8.3 2.5a2 2 0 0 1 3.4 0l6.3 11a2 2 0 0 1-1.7 3H3.7a2 2 0 0 1-1.7-3l6.3-11zM11 14a1 1 0 1 0-2 0 1 1 0 0 0 2 0zm-1-7a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1z',
  info: 'M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0zm-9-4a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm1 3a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1z',
}

export function Alert({ tone = 'error', title, onDismiss, children }) {
  if (!children && !title) return null

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex animate-fade-in items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm',
        ALERT_TONES[tone],
      )}
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fillRule="evenodd" d={ALERT_ICONS[tone]} clipRule="evenodd" />
      </svg>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 shrink-0 rounded p-1 opacity-60 transition hover:opacity-100"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.3 5A.9.9 0 0 0 5 6.3L8.6 10 5 13.7a.9.9 0 0 0 1.3 1.3L10 11.4l3.7 3.6a.9.9 0 0 0 1.3-1.3L11.4 10 15 6.3A.9.9 0 0 0 13.7 5L10 8.6z" />
          </svg>
        </button>
      )}
    </div>
  )
}

const BADGE_TONES = {
  slate: 'bg-surface-muted text-fg-muted ring-line',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-800',
  green: 'bg-success-bg text-success-fg ring-success-line',
  amber: 'bg-warning-bg text-warning-fg ring-warning-line',
  rose: 'bg-danger-bg text-danger-fg ring-danger-line',
  accent: 'bg-accent-500 text-slate-900 ring-accent-600',
}

export function Badge({ tone = 'slate', size = 'md', dot = false, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  )
}

/* ----------------------------------------------------------------- rating */

export function Stars({ value = 0, count, size = 'sm', showValue = false }) {
  const rounded = Math.round((value || 0) * 2) / 2
  const dimension = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' }[size]

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={value ? `${Number(value).toFixed(1)} out of 5` : 'No ratings yet'}
    >
      <span className="flex gap-px">
        {[1, 2, 3, 4, 5].map((i) => {
          // Half stars are drawn with a clipped overlay rather than a second
          // icon set, so a 4.5 rating reads accurately.
          const fill = Math.max(0, Math.min(1, rounded - i + 1))
          return (
            <span key={i} className={cn('relative', dimension)}>
              <Star className={cn(dimension, 'absolute inset-0 text-rating-empty')} />
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  {/* contrast-ok: gold on white is 1.6:1 and is the universal
                      rating convention. The rating is legible from the filled
                      fraction against the rating-empty track behind it, which
                      does meet the 3:1 graphic threshold. */}
                  <Star className={cn(dimension, 'text-accent-400')} />
                </span>
              )}
            </span>
          )
        })}
      </span>
      {showValue && value ? (
        <span className="text-xs font-semibold text-fg">{Number(value).toFixed(1)}</span>
      ) : null}
      {count !== undefined && (
        <span className="text-xs text-fg-subtle">
          ({count})
        </span>
      )}
    </span>
  )
}

function Star({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 15.27 16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
    </svg>
  )
}

/* ------------------------------------------------------------- feedback */

export function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-lg bg-surface-muted',
        // A moving highlight reads as "loading" far better than a pulse.
        'bg-[linear-gradient(90deg,transparent_0%,color-mix(in_oklab,var(--color-fg)_6%,transparent)_50%,transparent_100%)]',
        'bg-[length:200%_100%]',
        className,
      )}
    />
  )
}

export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-muted text-fg-subtle">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- structure */

export function PageHeader({ eyebrow, title, subtitle, action, className }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {items.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {index > 0 && (
            <svg className="h-3.5 w-3.5 text-fg-subtle" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M7.2 4.7a.9.9 0 0 0 0 1.3L11.1 10l-3.9 4a.9.9 0 0 0 1.3 1.3l4.5-4.6a.9.9 0 0 0 0-1.3L8.5 4.7a.9.9 0 0 0-1.3 0z" />
            </svg>
          )}
          {item.to ? (
            <Link to={item.to} className="text-fg-muted transition hover:text-brand-600 dark:hover:text-brand-400">
              {item.label}
            </Link>
          ) : (
            <span className="truncate font-medium text-fg" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function SectionHeading({ eyebrow, title, description, to, linkLabel = 'View all' }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {to && (
        <Link
          to={to}
          className="group inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
        >
          {linkLabel}
          <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
        </Link>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- pagination */

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null

  const window_ = []
  const start = Math.max(1, Math.min(page - 2, pages - 4))
  const end = Math.min(pages, start + 4)
  for (let i = Math.max(1, start); i <= end; i += 1) window_.push(i)

  const pageButton = (n) => (
    <button
      key={n}
      onClick={() => onChange(n)}
      aria-current={n === page ? 'page' : undefined}
      className={cn(
        'h-9 min-w-9 rounded-lg px-2.5 text-sm font-semibold transition',
        n === page
          ? 'bg-brand-600 text-white shadow-xs'
          : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
      )}
    >
      {n}
    </button>
  )

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Prev
      </Button>
      {start > 1 && (
        <>
          {pageButton(1)}
          {start > 2 && <span className="px-1 text-fg-subtle">…</span>}
        </>
      )}
      {window_.map(pageButton)}
      {end < pages && (
        <>
          {end < pages - 1 && <span className="px-1 text-fg-subtle">…</span>}
          {pageButton(pages)}
        </>
      )}
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next →
      </Button>
    </nav>
  )
}

/* --------------------------------------------------------------- pricing */

export function Money({ amount, className, size }) {
  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-3xl',
  }
  return (
    <span className={cn('tabular-nums', size && sizes[size], className)}>
      {formatMoney(amount)}
    </span>
  )
}

/** Price with strike-through original and a saving percentage. */
export function PriceBlock({ price, compareAt, discount, size = 'md' }) {
  const hasDeal = compareAt && Number(compareAt) > Number(price)
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <Money
        amount={price}
        size={size}
        className={cn('font-bold text-fg', size === 'xl' && 'tracking-tight')}
      />
      {hasDeal && (
        <>
          <Money amount={compareAt} className="text-sm text-fg-subtle line-through" />
          {discount > 0 && (
            <Badge tone="rose" size="sm">
              −{discount}%
            </Badge>
          )}
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- misc */

export function Divider({ label, className }) {
  if (!label) return <hr className={cn('border-line', className)} />
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <hr className="flex-1 border-line" />
      <span className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </span>
      <hr className="flex-1 border-line" />
    </div>
  )
}

/** Fixed-ratio image box with a graceful empty state. */
export function Thumb({ src, alt = '', ratio = 'square', className, children }) {
  const ratios = {
    square: 'aspect-square',
    wide: 'aspect-[4/3]',
    tall: 'aspect-[3/4]',
  }
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-surface-muted',
        ratios[ratio],
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full place-items-center text-fg-subtle">
          <svg className="h-1/4 w-1/4 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.16-5.16a2.25 2.25 0 013.18 0l5.16 5.16m-1.5-1.5l1.41-1.41a2.25 2.25 0 013.18 0l2.16 2.16M2.25 18h19.5a1.5 1.5 0 001.5-1.5V7.5a1.5 1.5 0 00-1.5-1.5H2.25A1.5 1.5 0 00.75 7.5v9A1.5 1.5 0 002.25 18z" />
          </svg>
        </div>
      )}
      {children}
    </div>
  )
}

/** Horizontally scrolling row for product rails on mobile. */
export function ScrollRow({ className, children }) {
  return (
    <div
      className={cn(
        'scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
