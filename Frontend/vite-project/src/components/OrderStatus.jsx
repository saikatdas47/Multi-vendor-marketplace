import { cn } from '../lib/cn'
import { Badge } from './ui'
import { CheckIcon } from './icons'

/** Shared status vocabulary so every screen labels and colours it identically. */
export const STATUS_TONE = {
  pending: 'amber',
  confirmed: 'brand',
  packed: 'brand',
  shipped: 'brand',
  out_for_delivery: 'brand',
  delivered: 'green',
  completed: 'green',
  cancelled: 'rose',
  refunded: 'rose',
}

export const STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

/** The happy path, in order. Cancelled/refunded sit outside it. */
export const TRACKING_STEPS = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
]

/** Mirrors ALLOWED_TRANSITIONS in orders/models.py. */
export const NEXT_STATUSES = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [],
  completed: [],
  cancelled: [],
  refunded: [],
}

export function StatusBadge({ status, label, size }) {
  const settled = ['delivered', 'completed', 'cancelled', 'refunded'].includes(status)
  return (
    <Badge tone={STATUS_TONE[status] || 'slate'} size={size} dot={!settled}>
      {label || STATUS_LABEL[status] || status}
    </Badge>
  )
}

/**
 * Horizontal progress rail. Hidden entirely for cancelled/refunded orders —
 * showing a half-complete progress bar for a dead order is misleading.
 */
export function TrackingTimeline({ status, events = [] }) {
  if (status === 'cancelled' || status === 'refunded') {
    const event = [...events].reverse().find((e) => e.status === status)
    return (
      <div className="rounded-xl border border-danger-line bg-danger-bg p-5">
        <p className="text-sm font-semibold text-danger-fg">{STATUS_LABEL[status]}</p>
        {event?.note && <p className="mt-1 text-sm text-danger-fg opacity-90">{event.note}</p>}
        {event && (
          <p className="mt-1.5 text-xs text-danger-fg opacity-70">
            {new Date(event.created_at).toLocaleString()}
          </p>
        )}
      </div>
    )
  }

  const reached = new Set(events.map((e) => e.status))
  const currentIndex = Math.max(TRACKING_STEPS.indexOf(status), 0)
  const progress = (currentIndex / (TRACKING_STEPS.length - 1)) * 100

  const timeFor = (step) => {
    const event = events.find((e) => e.status === step)
    return event ? new Date(event.created_at).toLocaleDateString() : null
  }

  return (
    <div className="relative">
      {/* One continuous rail behind the nodes, rather than per-step segments —
          much easier to keep aligned across breakpoints. */}
      <div className="absolute left-0 right-0 top-3.5 h-0.5 bg-line" aria-hidden="true">
        <div
          className="h-full bg-brand-500 transition-[width] duration-700 ease-out-soft"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="relative flex justify-between">
        {TRACKING_STEPS.map((step, index) => {
          const done = index < currentIndex || reached.has(step)
          const current = index === currentIndex
          return (
            <li key={step} className="flex flex-col items-center" style={{ width: '16.66%' }}>
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold transition-all duration-300',
                  // Completed steps are darker than the current one, not
                  // lighter: brand-500 on white is 4.47:1, just under AA for
                  // this 10px label. brand-700 reads as "settled" and the
                  // current step stays prominent through its ring.
                  current
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-950'
                    : done
                      ? 'bg-brand-700 text-white'
                      : 'bg-canvas text-fg-muted ring-2 ring-line',
                )}
              >
                {done && !current ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  'mt-2 max-w-20 text-center text-[11px] leading-tight sm:text-xs',
                  current ? 'font-semibold text-fg' : 'text-fg-subtle',
                )}
              >
                {STATUS_LABEL[step]}
              </span>
              {timeFor(step) && (
                <span className="mt-0.5 text-[10px] text-fg-subtle">{timeFor(step)}</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
