import { Link } from 'react-router-dom'

import { cn } from '../lib/cn'
import { Skeleton } from './ui'

const TONES = {
  neutral: 'text-fg',
  brand: 'text-brand-700 dark:text-brand-300',
  success: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  danger: 'text-red-700 dark:text-red-400',
}

/**
 * A single number with a label, optionally a link.
 *
 * The value is deliberately allowed to be `0` rather than falling back to a
 * dash: on a dashboard, "0 overdue" is a real and reassuring answer, while an
 * em-dash reads as "we don't know".
 */
export default function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  to,
  loading = false,
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          {label}
        </p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />}
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className={cn('mt-1.5 text-2xl font-bold tracking-tight', TONES[tone])}>
          {value ?? 0}
        </p>
      )}

      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </>
  )

  const className = cn(
    'rounded-card border border-line bg-surface p-4',
    to && 'transition hover:border-brand-300 hover:shadow-sm dark:hover:border-brand-700',
  )

  return to ? (
    <Link to={to} className={cn(className, 'block')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
