import { useMemo, useState } from 'react'

import { Skeleton } from './ui'
import { cn } from './../lib/cn'

/**
 * Sortable table with built-in loading and empty states.
 *
 * The reason this is one component: every dashboard table needs the same four
 * states — loading, empty, sorted, and "empty because of a filter" — and the
 * last one is the one that always gets forgotten. "No sellers" and "no sellers
 * matching your search" need different copy, and a shared component makes that
 * a required prop rather than an afterthought.
 *
 * Sorting is client-side and applies to the current page only. That is honest for
 * dashboards this size; a table that claimed to sort globally while only
 * reordering 20 rows would be a lie.
 *
 * `columns`: `[{ key, header, sortable, align, width, render(row), value(row) }]`
 * — `value` supplies the sort key when the rendered cell isn't sortable text.
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  loading = false,
  emptyTitle = 'Nothing here',
  emptyDescription,
  filtered = false,
  filteredTitle = 'No matches',
  filteredDescription = 'Try a different search or filter.',
  onRowClick,
  initialSort,
  className,
}) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return rows

    const read = column.value ?? ((row) => row[column.key])
    // A stable copy: sorting `rows` in place would mutate the query cache.
    return [...rows].sort((a, b) => {
      const x = read(a)
      const y = read(b)
      if (x == null && y == null) return 0
      if (x == null) return 1 // nulls last, regardless of direction
      if (y == null) return -1
      const result =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true })
      return sort.direction === 'asc' ? result : -result
    })
  }, [rows, sort, columns])

  const toggle = (key) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.direction === 'asc'
          ? { key, direction: 'desc' }
          : null // third click clears, so the server order is reachable again
        : { key, direction: 'asc' },
    )

  if (loading) {
    return (
      <div className={cn('overflow-hidden rounded-card border border-line bg-surface', className)}>
        <div className="space-y-px p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div
        className={cn(
          'rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center',
          className,
        )}
      >
        <p className="font-semibold text-fg">{filtered ? filteredTitle : emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
          {filtered ? filteredDescription : emptyDescription}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('overflow-x-auto rounded-card border border-line bg-surface', className)}>
      <table className="w-full text-sm">
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle',
                    column.align === 'right' ? 'text-right' : 'text-left',
                  )}
                  // Announce the current sort to assistive tech.
                  aria-sort={
                    active
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : column.sortable
                        ? 'none'
                        : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      onClick={() => toggle(column.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded transition hover:text-fg',
                        active && 'text-fg',
                      )}
                    >
                      {column.header}
                      <span aria-hidden="true" className="text-[10px]">
                        {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'transition',
                onRowClick && 'cursor-pointer hover:bg-surface-hover',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-fg-muted',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Segmented filter control, shared by every dashboard table. */
export function FilterTabs({ value, onChange, options, className }) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 rounded-lg border border-line bg-surface p-1', className)}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
              active
                ? 'bg-brand-600 text-white'
                : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
            )}
          >
            {option.label}
            {option.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] tabular-nums',
                  // Foreground stated on both branches. Inheriting worked only
                  // because the active tab happens to set text-white above; if
                  // that ever changed, this pill would silently go unreadable.
                  // A white wash *lightens* brand-600 until white text drops to 4.19:1.
                  // Darkening instead keeps the pill distinct and legible.
                  active ? 'bg-black/20 text-white' : 'bg-surface-muted text-fg-muted',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
