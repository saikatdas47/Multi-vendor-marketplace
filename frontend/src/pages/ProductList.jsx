import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { assistantApi, catalogApi } from '../api/endpoints'
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Pagination,
  Select,
  Spinner,
} from '../components/ui'
import { CloseIcon, FilterIcon, SearchIcon, SparkleIcon } from '../components/icons'
import { useDebounce } from '../hooks/useDebounce'
import { cn } from '../lib/cn'

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'price', label: 'Price: low to high' },
  { value: '-price', label: 'Price: high to low' },
  { value: '-avg_rating', label: 'Top rated' },
  { value: '-view_count', label: 'Most viewed' },
  { value: 'name', label: 'Name A–Z' },
]

const PRICE_PRESETS = [
  { label: 'Under 50', min: '', max: '50' },
  { label: '50 – 200', min: '50', max: '200' },
  { label: '200 – 500', min: '200', max: '500' },
  { label: '500+', min: '500', max: '' },
]


/**
 * Grounded AI answer above the results grid.
 *
 * Only fires for queries that read as a question or description — a one-word
 * search like "laptop" doesn't need prose, and calling the LLM for it would be
 * pure cost. Renders nothing when the assistant is unavailable.
 */
function AIAnswer({ query }) {
  const words = query.trim().split(/\s+/).filter(Boolean)
  const isNaturalLanguage =
    words.length >= 4 ||
    /\?|under|below|over|above|cheaper|between|best|gift|suggest|recommend|for a/i.test(query)

  const { data, isPending, isError } = useQuery({
    queryKey: ['ai-answer', query],
    queryFn: () => assistantApi.ask({ message: query }),
    enabled: Boolean(query) && isNaturalLanguage,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  if (!isNaturalLanguage) return null

  if (isPending) {
    return (
      <div className="mb-6 flex items-center gap-2.5 rounded-card border border-brand-200 bg-brand-50/60 px-5 py-4 dark:border-brand-800 dark:bg-brand-950/40">
        <Spinner className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <span className="text-sm text-fg-muted">Reading your question…</span>
      </div>
    )
  }

  if (isError || !data?.reply || data.ai === false) return null

  return (
    <div className="mb-6 rounded-card border border-brand-200 bg-gradient-to-br from-brand-50 to-transparent p-5 dark:border-brand-800 dark:from-brand-950/40">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          <SparkleIcon className="h-3 w-3" />
          AI
        </span>
        <h2 className="text-sm font-semibold text-fg">Answering your question</h2>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">
        {/* Citation markers are for the product list, not the reader. */}
        {data.reply.replace(/\s*\[\d{1,2}\]/g, '')}
      </p>
      <p className="mt-2.5 text-xs text-fg-subtle">
        Grounded in live catalogue data — verify details on the product page.
      </p>
    </div>
  )
}

export default function ProductList() {
  // The URL is the single source of truth, so results are shareable, survive a
  // refresh, and the browser back button behaves the way users expect.
  const [searchParams, setSearchParams] = useSearchParams()

  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')
  const debouncedSearch = useDebounce(searchInput)

  // Price fields get local state plus a debounce. Writing straight to the URL
  // would fire a request for "1", "15", "150", "1500" and reset pagination on
  // every keystroke.
  const [priceInput, setPriceInput] = useState({
    min: searchParams.get('min_price') || '',
    max: searchParams.get('max_price') || '',
  })
  const debouncedPrice = useDebounce(priceInput, 500)

  const [filtersOpen, setFiltersOpen] = useState(false)

  const page = Number(searchParams.get('page') || 1)
  const filters = {
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    min_price: searchParams.get('min_price') || '',
    max_price: searchParams.get('max_price') || '',
    in_stock: searchParams.get('in_stock') || '',
    on_sale: searchParams.get('on_sale') || '',
    is_featured: searchParams.get('is_featured') || '',
    ordering: searchParams.get('ordering') || '-created_at',
  }

  useEffect(() => {
    const current = searchParams.get('q') || ''
    if (debouncedSearch === current) return
    const next = new URLSearchParams(searchParams)
    if (debouncedSearch) next.set('q', debouncedSearch)
    else next.delete('q')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const currentMin = searchParams.get('min_price') || ''
    const currentMax = searchParams.get('max_price') || ''
    if (debouncedPrice.min === currentMin && debouncedPrice.max === currentMax) return

    const next = new URLSearchParams(searchParams)
    if (debouncedPrice.min) next.set('min_price', debouncedPrice.min)
    else next.delete('min_price')
    if (debouncedPrice.max) next.set('max_price', debouncedPrice.max)
    else next.delete('max_price')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [debouncedPrice]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the inputs in step when filters change from outside (chip removal,
  // preset click, back button).
  useEffect(() => {
    setPriceInput({
      min: searchParams.get('min_price') || '',
      max: searchParams.get('max_price') || '',
    })
    setSearchInput(searchParams.get('q') || '')
  }, [searchParams])

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearchParams(next)
  }

  function clearFilters() {
    setSearchInput('')
    setPriceInput({ min: '', max: '' })
    setSearchParams(new URLSearchParams())
  }

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catalogApi.categories({ page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  })

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ['products', { ...filters, page }],
    queryFn: () => catalogApi.products({ ...filters, page }),
    placeholderData: keepPreviousData,
  })

  const products = data?.results ?? []
  const categoryList = categories?.results ?? []

  // Active filters shown as removable chips — far clearer than leaving users
  // to spot which controls are still set.
  const chips = []
  if (filters.q) chips.push({ key: 'q', label: `“${filters.q}”` })
  if (filters.category) {
    const match = categoryList.find((c) => c.slug === filters.category)
    chips.push({ key: 'category', label: match?.name || filters.category })
  }
  if (filters.min_price) chips.push({ key: 'min_price', label: `Min ${filters.min_price}` })
  if (filters.max_price) chips.push({ key: 'max_price', label: `Max ${filters.max_price}` })
  if (filters.in_stock) chips.push({ key: 'in_stock', label: 'In stock' })
  if (filters.on_sale) chips.push({ key: 'on_sale', label: 'On sale' })
  if (filters.is_featured) chips.push({ key: 'is_featured', label: 'Featured' })

  const pricePresetActive = (preset) =>
    filters.min_price === preset.min && filters.max_price === preset.max

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          Category
        </h3>
        <Select
          value={filters.category}
          onChange={(e) => setFilter('category', e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categoryList.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.full_path}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          Price
        </h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                const next = new URLSearchParams(searchParams)
                if (pricePresetActive(preset)) {
                  next.delete('min_price')
                  next.delete('max_price')
                } else {
                  preset.min ? next.set('min_price', preset.min) : next.delete('min_price')
                  preset.max ? next.set('max_price', preset.max) : next.delete('max_price')
                }
                next.delete('page')
                setSearchParams(next)
              }}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition',
                pricePresetActive(preset)
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-fg-muted hover:bg-line hover:text-fg',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            placeholder="Min"
            aria-label="Minimum price"
            value={priceInput.min}
            onChange={(e) => setPriceInput((p) => ({ ...p, min: e.target.value }))}
          />
          <span className="text-fg-subtle">–</span>
          <Input
            type="number"
            min="0"
            placeholder="Max"
            aria-label="Maximum price"
            value={priceInput.max}
            onChange={(e) => setPriceInput((p) => ({ ...p, max: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          Availability
        </h3>
        <div className="space-y-2.5">
          <Checkbox
            label="In stock only"
            checked={filters.in_stock === 'true'}
            onChange={(e) => setFilter('in_stock', e.target.checked ? 'true' : '')}
          />
          <Checkbox
            label="On sale"
            description="Reduced from the usual price"
            checked={filters.on_sale === 'true'}
            onChange={(e) => setFilter('on_sale', e.target.checked ? 'true' : '')}
          />
          <Checkbox
            label="Featured"
            checked={filters.is_featured === 'true'}
            onChange={(e) => setFilter('is_featured', e.target.checked ? 'true' : '')}
          />
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* ------------------------------------------------------- search bar */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {filters.q ? `Results for “${filters.q}”` : 'Shop all products'}
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          {data
            ? `${data.count} product${data.count === 1 ? '' : 's'} available`
            : 'Loading catalogue…'}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[268px_1fr]">
        {/* ----------------------------------------------------- sidebar */}
        <aside className="hidden lg:block">
          <Card className="sticky top-24 p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <FilterIcon className="h-4 w-4" />
                Filters
              </h2>
              {chips.length > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-semibold text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
                >
                  Clear all
                </button>
              )}
            </div>
            {filterPanel}
          </Card>
        </aside>

        {/* -------------------------------------------------------- results */}
        <section>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="min-w-52 flex-1">
              <Input
                type="search"
                placeholder="Search products…"
                aria-label="Search products"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                leading={<SearchIcon className="h-4 w-4" />}
                trailing={isFetching ? <Spinner className="h-4 w-4" /> : null}
              />
            </div>

            <Button
              variant="secondary"
              onClick={() => setFiltersOpen(true)}
              className="lg:hidden"
            >
              <FilterIcon className="h-4 w-4" />
              Filters
              {chips.length > 0 && (
                <Badge tone="brand" size="sm">
                  {chips.length}
                </Badge>
              )}
            </Button>

            <Select
              className="w-auto min-w-44"
              aria-label="Sort products"
              value={filters.ordering}
              onChange={(e) => setFilter('ordering', e.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          {chips.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => {
                    if (chip.key === 'q') setSearchInput('')
                    if (chip.key === 'min_price') setPriceInput((p) => ({ ...p, min: '' }))
                    if (chip.key === 'max_price') setPriceInput((p) => ({ ...p, max: '' }))
                    setFilter(chip.key, '')
                  }}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-3 pr-2 text-xs font-medium text-fg-muted transition hover:border-red-300 hover:text-red-600 dark:hover:border-red-800 dark:hover:text-red-400"
                >
                  {chip.label}
                  <CloseIcon className="h-3 w-3" />
                </button>
              ))}
              <button
                onClick={clearFilters}
                className="text-xs font-semibold text-fg-subtle underline-offset-2 transition hover:text-fg hover:underline"
              >
                Clear all
              </button>
            </div>
          )}

          {filters.q && <AIAnswer query={filters.q} />}

          {isError && (
            <div className="mb-5">
              <Alert>{error.message}</Alert>
            </div>
          )}

          {isPending ? (
            <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="h-5 w-5" />}
              title="No products found"
              description="Try widening your price range, clearing a filter, or searching for something else."
              action={
                chips.length > 0 && (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                )
              }
            />
          ) : (
            <div
              className={cn(
                'grid grid-cols-1 gap-4 transition-opacity duration-200 min-[390px]:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4',
                // Dim slightly while the next page loads instead of unmounting
                // the grid, which would collapse scroll position.
                isFetching && 'opacity-60',
              )}
            >
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          <Pagination
            page={data?.page ?? 1}
            pages={data?.pages ?? 1}
            onChange={(p) => {
              setFilter('page', String(p))
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </section>
      </div>

      {/* --------------------------------------------- mobile filter sheet */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-sm"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-fg">Filters</h2>
              <button
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
                className="grid h-9 w-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted"
              >
                <CloseIcon />
              </button>
            </div>

            {filterPanel}

            <div className="mt-6 flex gap-2">
              <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                Show {data?.count ?? 0} results
              </Button>
              <Button variant="secondary" onClick={clearFilters}>
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
