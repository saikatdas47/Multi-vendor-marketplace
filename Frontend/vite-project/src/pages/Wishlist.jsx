import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useWishlist } from '../hooks/useCart'
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  PriceBlock,
  Skeleton,
  Thumb,
} from '../components/ui'
import { CartIcon, HeartIcon, TrashIcon } from '../components/icons'

export default function Wishlist() {
  const wishlist = useWishlist()
  const [error, setError] = useState('')

  if (wishlist.isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    )
  }

  if (!wishlist.items.length) {
    return (
      <div className="py-10">
        <EmptyState
          icon={<HeartIcon className="h-6 w-6" />}
          title="Your wishlist is empty"
          description="Tap the heart on any product card to save it for later."
          action={
            <Button as={Link} to="/products">
              Browse products
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Wishlist" subtitle={`${wishlist.items.length} saved`} />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {wishlist.items.map((item) => (
          <li
            key={item.id}
            className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-all duration-200 ease-out-soft hover:-translate-y-1 hover:shadow-lg"
          >
            <Link to={`/products/${item.product.slug}`}>
              <Thumb src={item.product.primary_image} alt={item.product.name} />
            </Link>

            <div className="flex flex-1 flex-col p-4">
              <Link
                to={`/products/${item.product.slug}`}
                className="line-clamp-2 text-sm font-semibold text-fg transition group-hover:text-brand-600 dark:group-hover:text-brand-400"
              >
                {item.product.name}
              </Link>
              <div className="mt-2">
                <PriceBlock
                  price={item.product.price}
                  compareAt={item.product.compare_at_price}
                  discount={item.product.discount_percent}
                />
              </div>

              <div className="mt-auto flex gap-2 pt-4">
                <Button
                  size="sm"
                  className="flex-1"
                  loading={wishlist.moveToCart.isPending}
                  disabled={item.product.stock === 0}
                  onClick={() => {
                    setError('')
                    wishlist.moveToCart.mutate(item.id, {
                      onError: (err) => setError(err.message),
                    })
                  }}
                >
                  {item.product.stock !== 0 && <CartIcon className="h-3.5 w-3.5" />}
                  {item.product.stock === 0 ? 'Out of stock' : 'Move to cart'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label="Remove from wishlist"
                  className="w-9 px-0"
                  onClick={() => wishlist.toggle.mutate(item.product.id)}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
