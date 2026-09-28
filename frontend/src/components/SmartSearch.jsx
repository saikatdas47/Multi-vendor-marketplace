import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { assistantApi } from '../api/endpoints'
import { useDebounce } from '../hooks/useDebounce'
import { cn } from '../lib/cn'
import { CloseIcon, SearchIcon, SparkleIcon } from './icons'
import { Badge, Money, Spinner, Thumb } from './ui'

const ORDERING_LABEL = {
  price: 'Cheapest first',
  '-price': 'Most expensive first',
  '-avg_rating': 'Best rated',
  '-view_count': 'Most popular',
  '-created_at': 'Newest',
}

/**
 * Search box with an AI-parsed dropdown.
 *
 * The "AI" here is the same natural-language parser the shopping assistant
 * uses — price ranges, sort intent, category names — running server-side with
 * **no LLM call**. That's deliberate: it's fast enough to fire while the user
 * types and costs nothing, and the inferred filters are shown back as chips so
 * the understanding is visible rather than implied.
 *
 * A conversational answer is one keystroke away: the last row hands the same
 * query to the assistant.
 */
export default function SmartSearch({ className, autoFocus, onNavigate }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const debounced = useDebounce(term, 220)

  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const { data, isFetching } = useQuery({
    queryKey: ['search-suggest', debounced],
    queryFn: () => assistantApi.suggest(debounced),
    enabled: debounced.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  useEffect(() => {
    const onPointer = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  // Cmd/Ctrl+K focuses search — the shortcut people already have muscle memory
  // for from every other modern app.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // The Node endpoint returns a compact product array. Keep compatibility
  // with the richer object response too, so search works with either shape.
  const products = Array.isArray(data)
    ? data.map((product) => ({ ...product, primary_image: product.primary_image || product.image }))
    : (data?.products ?? [])
  const categories = Array.isArray(data) ? [] : (data?.categories ?? [])
  const understood = data?.understood ?? {}

  // One flat list so arrow keys can walk everything in visual order.
  const rows = useMemo(() => {
    const list = [
      ...categories.map((c) => ({ kind: 'category', to: `/products?category=${c.slug}`, item: c })),
      ...products.map((p) => ({ kind: 'product', to: `/products/${p.slug}`, item: p })),
    ]
    if (term.trim()) {
      list.push({ kind: 'all', to: `/products?q=${encodeURIComponent(term.trim())}` })
      if (data?.ai_available !== false) list.push({ kind: 'ask' })
    }
    return list
  }, [categories, products, term, data?.ai_available])

  function go(row) {
    setOpen(false)
    setCursor(-1)
    onNavigate?.()
    if (row.kind === 'ask') {
      // The widget listens for this and opens with the query pre-sent.
      window.dispatchEvent(
        new CustomEvent('commercex:ask-assistant', { detail: term.trim() }),
      )
      return
    }
    navigate(row.to)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') return setOpen(false)

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!rows.length) return
      setOpen(true)
      setCursor((c) => {
        const next = event.key === 'ArrowDown' ? c + 1 : c - 1
        return (next + rows.length) % rows.length
      })
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (cursor >= 0 && rows[cursor]) return go(rows[cursor])
      const q = term.trim()
      setOpen(false)
      onNavigate?.()
      navigate(q ? `/products?q=${encodeURIComponent(q)}` : '/products')
    }
  }

  const chips = []
  if (understood.category) chips.push(understood.category.name)
  if (understood.min_price) chips.push(`Min ${understood.min_price}`)
  if (understood.max_price) chips.push(`Max ${understood.max_price}`)
  if (understood.ordering) chips.push(ORDERING_LABEL[understood.ordering] || understood.ordering)

  const showPanel = open && term.trim().length >= 2

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-label="Search products"
          autoFocus={autoFocus}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
            setOpen(true)
            setCursor(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Try “laptop under $1000”…"
          className="h-11 w-full rounded-xl bg-surface-muted pl-9 pr-20 text-sm text-fg ring-1 ring-inset ring-transparent transition placeholder:text-fg-subtle focus:bg-surface focus:outline-none focus:ring-brand-500"
        />

        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {isFetching && <Spinner className="h-3.5 w-3.5 text-fg-subtle" />}
          {term ? (
            <button
              onClick={() => {
                setTerm('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="grid h-6 w-6 place-items-center rounded text-fg-subtle transition hover:text-fg"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle lg:block">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] animate-fade-up overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                <SparkleIcon className="h-3 w-3" />
                Understood
              </span>
              {chips.map((chip) => (
                <Badge key={chip} tone="brand" size="sm">
                  {chip}
                </Badge>
              ))}
            </div>
          )}

          {categories.length > 0 && (
            <>
              <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                Categories
              </p>
              {categories.map((category, index) => {
                const rowIndex = index
                return (
                  <Link
                    key={category.id}
                    to={`/products?category=${category.slug}`}
                    onClick={() => go(rows[rowIndex])}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
                      cursor === rowIndex
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                        : 'text-fg-muted hover:bg-surface-muted',
                    )}
                  >
                    <SearchIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    Browse <span className="font-semibold text-fg">{category.name}</span>
                  </Link>
                )
              })}
            </>
          )}

          {products.length > 0 && (
            <>
              <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                Products
              </p>
              {products.map((product, index) => {
                const rowIndex = categories.length + index
                return (
                  <Link
                    key={product.id}
                    to={`/products/${product.slug}`}
                    onClick={() => go(rows[rowIndex])}
                    className={cn(
                      'flex items-center gap-3 rounded-lg p-2 transition',
                      cursor === rowIndex ? 'bg-surface-muted' : 'hover:bg-surface-muted',
                    )}
                  >
                    <Thumb
                      src={product.primary_image}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {product.category_name} · {product.seller_name}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Money amount={product.price} className="text-sm font-bold text-fg" />
                      {product.stock === 0 && (
                        <span className="block text-[10px] text-red-700 dark:text-red-400">
                          Out of stock
                        </span>
                      )}
                    </span>
                  </Link>
                )
              })}
            </>
          )}

          {products.length === 0 && categories.length === 0 && !isFetching && (
            <div className="px-3 py-5 text-center">
              <p className="text-sm font-semibold text-fg">No matching products found</p>
              <p className="mt-1 text-xs text-fg-muted">
                Check the spelling or browse all results for this search.
              </p>
            </div>
          )}

          <div className="mt-1.5 border-t border-line pt-1.5">
            <button
              onClick={() => go({ kind: 'all', to: `/products?q=${encodeURIComponent(term.trim())}` })}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition',
                cursor === rows.findIndex((r) => r.kind === 'all')
                  ? 'bg-surface-muted text-fg'
                  : 'text-fg-muted hover:bg-surface-muted',
              )}
            >
              <SearchIcon className="h-3.5 w-3.5 shrink-0" />
              See all results for <span className="font-semibold text-fg">“{term.trim()}”</span>
            </button>

            {data?.ai_available !== false && (
              <button
                onClick={() => go({ kind: 'ask' })}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition',
                  cursor === rows.findIndex((r) => r.kind === 'ask')
                    ? 'bg-brand-50 dark:bg-brand-950/60'
                    : 'hover:bg-brand-50 dark:hover:bg-brand-950/60',
                )}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-brand-600 text-white">
                  <SparkleIcon className="h-3 w-3" />
                </span>
                <span className="text-fg-muted">
                  Ask the assistant:{' '}
                  <span className="font-semibold text-fg">“{term.trim()}”</span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
