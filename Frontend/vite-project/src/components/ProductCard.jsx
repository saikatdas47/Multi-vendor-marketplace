import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { useCart, useWishlist } from '../hooks/useCart'
import { cn } from '../lib/cn'
import { CartIcon, CheckIcon, HeartIcon } from './icons'
import { Badge, PriceBlock, Skeleton, Stars, Thumb } from './ui'

export function ProductCard({ product, className }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const cart = useCart()
  const wishlist = useWishlist()

  const [added, setAdded] = useState(false)
  const [error, setError] = useState('')

  const outOfStock = product.stock === 0
  const lowStock = !outOfStock && product.stock <= 5
  const saved = wishlist.has(product.id)

  function requireLogin() {
    navigate('/login', { state: { from: { pathname: `/products/${product.slug}` } } })
  }

  // Quick actions sit inside a Link, so every handler has to stop the click
  // from also navigating to the product page.
  function quickAdd(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!isAuthenticated) return requireLogin()
    setError('')
    cart.addItem.mutate(
      { productId: product.id, quantity: 1 },
      {
        onSuccess: () => {
          setAdded(true)
          setTimeout(() => setAdded(false), 1800)
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  function toggleSave(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!isAuthenticated) return requireLogin()
    wishlist.toggle.mutate(product.id)
  }

  return (
    <Link
      to={`/products/${product.slug}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface',
        'transition-all duration-200 ease-out-soft',
        'hover:-translate-y-1 hover:border-line-strong hover:shadow-lg',
        'focus-visible:-translate-y-1 focus-visible:shadow-lg',
        className,
      )}
    >
      {/* Thumb is used without `src` so the image can carry its own hover
          zoom; passing src would render a second, static <img>. */}
      <Thumb alt={product.name}>
        {product.primary_image && (
          <img
            src={product.primary_image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-105"
          />
        )}

        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {product.discount_percent > 0 && (
            <Badge tone="rose" size="sm">
              −{product.discount_percent}%
            </Badge>
          )}
          {product.is_featured && (
            <Badge tone="accent" size="sm">
              Featured
            </Badge>
          )}
          {lowStock && (
            <Badge tone="amber" size="sm">
              Only {product.stock} left
            </Badge>
          )}
        </div>

        <button
          onClick={toggleSave}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className={cn(
            'absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full',
            'bg-surface/90 backdrop-blur transition-all duration-200',
            'hover:scale-110 hover:bg-surface',
            saved
              ? 'text-red-600 opacity-100 dark:text-red-400'
              : 'text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <HeartIcon solid={saved} className="h-4.5 w-4.5" />
        </button>

        {outOfStock && (
          <div className="absolute inset-0 grid place-items-center bg-surface/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-fg px-3 py-1 text-xs font-semibold text-canvas">
              Out of stock
            </span>
          </div>
        )}

        {/* Quick-add slides up from the bottom edge on hover. Hidden from
            keyboard tab order would be wrong, so it's focus-visible too. */}
        {!outOfStock && (
          <div className="absolute inset-x-2.5 bottom-2.5 translate-y-[130%] opacity-0 transition-all duration-200 ease-out-soft group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <button
              onClick={quickAdd}
              disabled={cart.addItem.isPending}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-md transition',
                added
                  ? 'bg-emerald-700 text-white'
                  : 'bg-fg text-canvas hover:bg-brand-600 hover:text-white',
              )}
            >
              {added ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5" /> Added
                </>
              ) : (
                <>
                  <CartIcon className="h-3.5 w-3.5" /> Quick add
                </>
              )}
            </button>
          </div>
        )}
      </Thumb>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          {product.category_name}
        </p>

        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-fg transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
          {product.name}
        </h3>

        <div className="mt-2 min-h-5">
          {product.review_count > 0 ? (
            <Stars value={product.avg_rating} count={product.review_count} />
          ) : (
            <span className="text-xs text-fg-subtle">No reviews yet</span>
          )}
        </div>

        <div className="mt-auto pt-3">
          <PriceBlock
            price={product.price}
            compareAt={product.compare_at_price}
            discount={product.discount_percent}
          />
          <p className="mt-1.5 truncate text-xs text-fg-subtle">{product.seller_name}</p>
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-2.5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  )
}
