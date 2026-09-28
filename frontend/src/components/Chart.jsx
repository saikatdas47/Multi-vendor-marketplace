import { useId, useMemo, useState } from 'react'

import { formatMoney } from '../config'
import { cn } from '../lib/cn'

/**
 * Inline SVG charts.
 *
 * Hand-rolled rather than pulling in Recharts or Chart.js: these two shapes are
 * all the dashboards need, and a charting library is a large dependency to
 * carry — plus both want their own colour config, which would sit outside the
 * design token system and drift from it in dark mode. `currentColor` and CSS
 * variables mean these follow the theme for free.
 *
 * viewBox coordinates with `preserveAspectRatio="none"` would distort strokes,
 * so the geometry is computed against a fixed 1000-unit width and the SVG
 * scales with `width="100%"` and a real aspect ratio.
 */

const W = 1000
const H = 260
const PAD = { top: 16, right: 8, bottom: 28, left: 8 }

function niceMax(value) {
  // Round the axis up to something a human would pick, so the top gridline is a
  // readable number instead of 8347.
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const scaled = value / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

/** Bar chart over a dated series: `[{ date, revenue, orders }]`. */
export function BarChart({ data = [], valueKey = 'revenue', money = true, className }) {
  const gradientId = useId()
  const [hover, setHover] = useState(null)

  const { bars, max, total } = useMemo(() => {
    const values = data.map((d) => Number(d[valueKey]) || 0)
    const peak = niceMax(Math.max(...values, 0))
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom
    const slot = data.length ? innerW / data.length : innerW
    const barW = Math.max(slot * 0.62, 2)

    return {
      max: peak,
      total: values.reduce((a, b) => a + b, 0),
      bars: data.map((d, i) => {
        const value = Number(d[valueKey]) || 0
        const height = peak ? (value / peak) * innerH : 0
        return {
          ...d,
          value,
          x: PAD.left + slot * i + (slot - barW) / 2,
          y: PAD.top + innerH - height,
          w: barW,
          h: Math.max(height, value > 0 ? 2 : 0),
        }
      }),
    }
  }, [data, valueKey])

  if (!data.length) {
    return (
      <div className="grid h-40 place-items-center rounded-lg border border-dashed border-line-strong text-sm text-fg-subtle">
        No sales data yet
      </div>
    )
  }

  const fmt = (v) => (money ? formatMoney(v) : String(v))

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${valueKey} over the last ${data.length} days, total ${fmt(total)}`}
        className="block h-auto w-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" />
            <stop offset="100%" stopColor="var(--color-brand-700)" />
          </linearGradient>
        </defs>

        {/* Gridlines at 0 / 50 / 100% of the axis. */}
        {[0, 0.5, 1].map((fraction) => {
          const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - fraction)
          return (
            <g key={fraction}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth="1.5"
              />
              <text
                x={PAD.left}
                y={y - 5}
                fill="var(--color-fg-subtle)"
                fontSize="15"
                className="tabular-nums"
              >
                {fmt(max * fraction)}
              </text>
            </g>
          )
        })}

        {bars.map((bar) => (
          <g key={bar.date}>
            {/* Full-height hit area: a 2px bar is impossible to hover. */}
            <rect
              x={bar.x - 2}
              y={PAD.top}
              width={bar.w + 4}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(bar)}
              onMouseLeave={() => setHover(null)}
            />
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              rx="3"
              fill={`url(#${gradientId})`}
              opacity={hover && hover.date !== bar.date ? 0.45 : 1}
              className="transition-opacity"
            />
          </g>
        ))}

        {/* First, middle and last date only — 30 labels would be unreadable. */}
        {[0, Math.floor(bars.length / 2), bars.length - 1].map((i) => {
          const bar = bars[i]
          if (!bar) return null
          return (
            <text
              key={bar.date}
              x={bar.x + bar.w / 2}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === bars.length - 1 ? 'end' : 'middle'}
              fill="var(--color-fg-subtle)"
              fontSize="15"
            >
              {new Date(bar.date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </text>
          )
        })}
      </svg>

      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
          <p className="font-semibold text-fg">{fmt(hover.value)}</p>
          <p className="text-fg-subtle">
            {new Date(hover.date).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
            {hover.orders != null && ` · ${hover.orders} order${hover.orders === 1 ? '' : 's'}`}
          </p>
        </div>
      )}
    </div>
  )
}

/** Horizontal proportion bar: `[{ label, value, tone }]`. */
export function StackedBar({ segments = [], className }) {
  const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0)

  if (!total) {
    return (
      <div className={cn('h-2.5 w-full rounded-full bg-surface-muted', className)} />
    )
  }

  const TONES = {
    brand: 'bg-brand-600',
    green: 'bg-emerald-600',
    amber: 'bg-amber-500',
    rose: 'bg-red-600',
    slate: 'bg-line-strong',
  }

  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              className={TONES[segment.tone] ?? TONES.slate}
              style={{ width: `${(segment.value / total) * 100}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn('h-2 w-2 rounded-full', TONES[segment.tone] ?? TONES.slate)}
            />
            <span className="text-fg-muted">{segment.label}</span>
            <span className="font-semibold tabular-nums text-fg">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
