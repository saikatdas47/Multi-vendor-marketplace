import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { aiApi, catalogApi, reviewApi } from '../api/endpoints'
import { useAuth } from '../hooks/useAuth'
import { useCart, useWishlist } from '../hooks/useCart'
import { cn } from '../lib/cn'
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardBody,
  Divider,
  EmptyState,
  Field,
  PriceBlock,
  Skeleton,
  Stars,
  Textarea,
  Thumb,
} from '../components/ui'
import {
  CartIcon,
  CheckIcon,
  HeartIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
  SparkleIcon,
  TruckIcon,
} from '../components/icons'

/* ---------------------------------------------------------------- gallery */

function Gallery({ images, name }) {
  const [active, setActive] = useState(0)

  if (!images?.length) {
    return <Thumb className="rounded-card border border-line" alt={name} />
  }

  return (
    <div className="lg:sticky lg:top-24">
      <Thumb
        src={images[active].image}
        alt={images[active].alt_text || name}
        className="rounded-card border border-line"
      />

      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2.5">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setActive(index)}
              aria-label={`View image ${index + 1}`}
              aria-current={index === active}
              className={cn(
                'overflow-hidden rounded-lg border-2 transition',
                index === active
                  ? 'border-brand-500'
                  : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <Thumb src={image.image} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- buy box */

function BuyBox({ product }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const cart = useCart()
  const wishlist = useWishlist()

  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)

  const variants = product.variants ?? []
  const selected = variants.find((v) => v.id === variantId)
  const stock = selected ? selected.stock : product.stock
  const outOfStock = stock === 0
  const needsVariant = variants.length > 0 && !variantId
  const saved = wishlist.has(product.id)

  const requireLogin = () =>
    navigate('/login', { state: { from: { pathname: `/products/${product.slug}` } } })

  function handleAdd() {
    if (!isAuthenticated) return requireLogin()
    setError('')
    cart.addItem.mutate(
      { productId: product.id, variantId: variantId || undefined, quantity },
      {
        onSuccess: () => {
          setAdded(true)
          setTimeout(() => setAdded(false), 2500)
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <div className="space-y-5">
      {variants.length > 0 && (
        <div>
          <span className="mb-2 block text-sm font-semibold text-fg">
            Choose an option
          </span>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                disabled={variant.stock === 0}
                onClick={() => setVariantId(variant.id === variantId ? '' : variant.id)}
                className={cn(
                  'rounded-lg border px-3.5 py-2 text-sm font-medium transition',
                  'disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through',
                  variant.id === variantId
                    ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:bg-brand-950/50 dark:text-brand-300'
                    : 'border-line-strong bg-surface text-fg-muted hover:border-fg-subtle hover:text-fg',
                )}
              >
                {variant.name}: {variant.value}
                {Number(variant.price_delta) !== 0 && (
                  <span className="ml-1.5 text-xs opacity-70">
                    {Number(variant.price_delta) > 0 ? '+' : ''}
                    {variant.price_delta}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <Alert>{error}</Alert>}
      {added && (
        <Alert tone="success">
          Added to your cart.{' '}
          <Link to="/cart" className="font-semibold underline underline-offset-2">
            View cart →
          </Link>
        </Alert>
      )}

      <div className="flex flex-wrap items-stretch gap-3">
        <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
            className="grid h-12 w-11 place-items-center rounded-l-lg text-fg-muted transition hover:bg-surface-muted disabled:opacity-30"
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-sm font-semibold tabular-nums text-fg">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(stock || 1, q + 1))}
            disabled={quantity >= stock}
            aria-label="Increase quantity"
            className="grid h-12 w-11 place-items-center rounded-r-lg text-fg-muted transition hover:bg-surface-muted disabled:opacity-30"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        <Button
          size="lg"
          className="min-w-44 flex-1"
          disabled={outOfStock || needsVariant}
          loading={cart.addItem.isPending}
          onClick={handleAdd}
        >
          {!outOfStock && !needsVariant && <CartIcon className="h-4.5 w-4.5" />}
          {outOfStock ? 'Out of stock' : needsVariant ? 'Select an option' : 'Add to cart'}
        </Button>

        <Button
          size="lg"
          variant="secondary"
          aria-label={saved ? 'Remove from wishlist' : 'Save for later'}
          loading={wishlist.toggle.isPending}
          onClick={() => (isAuthenticated ? wishlist.toggle.mutate(product.id) : requireLogin())}
          className={cn('w-12 px-0', saved && 'text-red-600 dark:text-red-400')}
        >
          <HeartIcon solid={saved} className="h-5 w-5" />
        </Button>
      </div>

      {!outOfStock && stock <= 5 && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-accent-700 dark:text-accent-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-500" />
          Only {stock} left in stock — order soon
        </p>
      )}

      <div className="grid gap-2.5 rounded-xl bg-surface-muted p-4 text-sm sm:grid-cols-3">
        {[
          { icon: TruckIcon, label: 'Free delivery' },
          { icon: ShieldIcon, label: 'Stock verified' },
          { icon: RefreshIcon, label: 'Cancel before shipping' },
        ].map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-2 text-fg-muted">
            <Icon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <span className="text-xs">{label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ ai summary */

function ReviewSummary({ slug }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['review-summary', slug],
    queryFn: () => aiApi.reviewSummary(slug),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  // Renders nothing when the backend has no AI key or too few reviews — it
  // returns 204, which the API layer maps to null. Purely additive.
  if (isPending || isError || !data?.summary) return null

  return (
    <div className="mb-6 rounded-card border border-brand-200 bg-gradient-to-br from-brand-50 to-transparent p-5 dark:border-brand-800 dark:from-brand-950/50">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          <SparkleIcon className="h-3 w-3" />
          AI
        </span>
        <h3 className="text-sm font-semibold text-fg">What reviewers say</h3>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">{data.summary}</p>
      <p className="mt-2 text-xs text-fg-subtle">
        Summarised from {data.based_on} review{data.based_on === 1 ? '' : 's'}.
      </p>
    </div>
  )
}

/* ----------------------------------------------------------- review form */

function ReviewForm({ productId, onDone }) {
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => reviewApi.create({ product: productId, rating, title, comment }),
    onSuccess: () => {
      setTitle('')
      setComment('')
      setError('')
      onDone()
    },
    onError: (err) => setError(err.message),
  })

  return (
    <Card>
      <CardBody>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          <h3 className="text-sm font-semibold text-fg">Write a review</h3>
          {error && <Alert>{error}</Alert>}

          <Field label="Rating" required>
            {/* Clickable stars rather than a number select — matches how the
                rating is displayed everywhere else. */}
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  className="rounded p-0.5 transition hover:scale-110"
                >
                  {/* contrast-ok: gold rating fill, 1.6:1 by convention;
                      the rating-empty track behind it carries the 3:1. */}
                  <svg
                    className={cn(
                      'h-7 w-7 transition-colors',
                      value <= rating ? 'text-accent-400' : 'text-rating-empty',
                    )}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 15.27 16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
                  </svg>
                </button>
              ))}
              <span className="ml-2 text-sm font-semibold text-fg">{rating}/5</span>
            </div>
          </Field>

          <Field label="Title">
            <input
              className="h-10 w-full rounded-lg bg-surface px-3 text-sm text-fg shadow-xs ring-1 ring-inset ring-line-strong placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="Sums up your experience"
            />
          </Field>

          <Field label="Your review">
            <Textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you like or dislike? How did you use it?"
            />
          </Field>

          <Button type="submit" loading={mutation.isPending} className="w-full">
            Submit review
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

/* -------------------------------------------------------------------- page */

export default function ProductDetail() {
  const { slug } = useParams()
  const queryClient = useQueryClient()
  const { isAuthenticated, user } = useAuth()
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewSort, setReviewSort] = useState('recent')

  const { data: product, isPending, isError, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => catalogApi.product(slug),
  })

  const { data: reviews } = useQuery({
    queryKey: ['product-reviews', slug],
    queryFn: () => catalogApi.productReviews(slug),
    enabled: Boolean(product),
  })

  if (isPending) {
    return (
      <div className="grid gap-10 lg:grid-cols-2">
        <Skeleton className="aspect-square rounded-card" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        title="Product unavailable"
        description={error.message}
        action={
          <Button as={Link} to="/products" variant="secondary">
            Back to shop
          </Button>
        }
      />
    )
  }

  const outOfStock = product.stock === 0
  const alreadyReviewed = reviews?.results?.some((r) => r.user === user?.id)

  // Rating histogram gives the review section credibility at a glance.
  const distribution = [5, 4, 3, 2, 1].map((star) => {
    const list = reviews?.results ?? []
    const count = list.filter((r) => r.rating === star).length
    return { star, count, pct: list.length ? (count / list.length) * 100 : 0 }
  })
  const reviewList = [...(reviews?.results ?? [])]
    .filter((review) => !reviewRating || review.rating === reviewRating)
    .sort((a, b) => {
      if (reviewSort === 'highest') return b.rating - a.rating
      if (reviewSort === 'helpful') return (b.helpful_count || 0) - (a.helpful_count || 0)
      return new Date(b.created_at) - new Date(a.created_at)
    })
  const recommendPercent = reviews?.results?.length
    ? Math.round(
        (reviews.results.filter((review) => review.rating >= 4).length /
          reviews.results.length) *
          100,
      )
    : 0

  return (
    <div className="space-y-14">
      <Breadcrumbs
        items={[
          { to: '/', label: 'Home' },
          { to: '/products', label: 'Shop' },
          ...(product.category
            ? [{ to: `/products?category=${product.category.slug}`, label: product.category.name }]
            : []),
          { label: product.name },
        ]}
      />

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <Gallery images={product.images} name={product.name} />

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {product.discount_percent > 0 && (
              <Badge tone="rose">−{product.discount_percent}% off</Badge>
            )}
            {product.is_featured && <Badge tone="accent">Featured</Badge>}
            {outOfStock ? (
              <Badge tone="rose" dot>
                Out of stock
              </Badge>
            ) : product.is_low_stock ? (
              <Badge tone="amber" dot>
                Low stock
              </Badge>
            ) : (
              <Badge tone="green" dot>
                In stock
              </Badge>
            )}
          </div>

          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-fg sm:text-4xl">
            {product.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {product.review_count > 0 ? (
              <a href="#reviews" className="transition hover:opacity-80">
                <Stars
                  value={product.avg_rating}
                  count={product.review_count}
                  size="md"
                  showValue
                />
              </a>
            ) : (
              <span className="text-sm text-fg-subtle">No reviews yet</span>
            )}
            <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-line-strong" />
            <Link
              to={`/products?seller=${product.seller?.slug}`}
              className="text-sm font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
            >
              {product.seller?.shop_name}
            </Link>
          </div>

          <div className="mt-6">
            <PriceBlock
              price={product.price}
              compareAt={product.compare_at_price}
              discount={product.discount_percent}
              size="xl"
            />
          </div>

          {product.short_description && (
            <p className="mt-5 text-base leading-relaxed text-fg-muted">
              {product.short_description}
            </p>
          )}

          <Divider className="my-7" />

          <BuyBox product={product} />
        </div>
      </div>

      {/* ------------------------------------------------------ description */}
      {(product.description || product.sku) && (
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          {product.description && (
            <div>
              <h2 className="text-xl font-bold tracking-tight text-fg">
                About this product
              </h2>
              <p className="mt-4 whitespace-pre-line leading-relaxed text-fg-muted">
                {product.description}
              </p>
            </div>
          )}

          <Card>
            <CardBody>
              <h2 className="mb-4 text-sm font-semibold text-fg">Specifications</h2>
              <dl className="divide-y divide-line text-sm">
                {[
                  ['SKU', product.sku],
                  ['Category', product.category?.full_path],
                  ['Seller', product.seller?.shop_name],
                  product.weight_grams && ['Weight', `${product.weight_grams} g`],
                  ['Availability', outOfStock ? 'Out of stock' : `${product.stock} in stock`],
                ]
                  .filter(Boolean)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-2.5">
                      <dt className="text-fg-subtle">{label}</dt>
                      <dd className="text-right font-medium text-fg">{value}</dd>
                    </div>
                  ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------- reviews */}
      <section id="reviews" className="scroll-mt-24">
        <h2 className="mb-6 text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Customer reviews
          {reviews?.count ? (
            <span className="ml-2 font-normal text-fg-subtle">({reviews.count})</span>
          ) : null}
        </h2>

        <ReviewSummary slug={slug} />

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {reviews?.results?.length ? (
              <>
                <Card>
                  <CardBody className="flex flex-wrap items-center gap-8">
                    <div className="min-w-28 text-center">
                      <p className="text-4xl font-bold tracking-tight text-fg">
                        {product.avg_rating ? Number(product.avg_rating).toFixed(1) : '—'}
                      </p>
                      <div className="mt-1.5 flex justify-center">
                        <Stars value={product.avg_rating} size="md" />
                      </div>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {product.review_count} review{product.review_count === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="hidden h-20 w-px bg-line sm:block" />

                    <div className="min-w-28 text-center">
                      <p className="text-3xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">
                        {recommendPercent}%
                      </p>
                      <p className="mt-1 text-xs font-medium text-fg-muted">recommend this product</p>
                      <p className="mt-1 text-[10px] text-fg-subtle">Ratings of 4 stars or higher</p>
                    </div>

                    <div className="min-w-48 flex-1 space-y-1.5">
                      {distribution.map(({ star, count, pct }) => (
                        <div key={star} className="flex items-center gap-2 text-xs">
                          <span className="w-6 text-fg-subtle">{star}★</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-accent-400 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-6 text-right tabular-nums text-fg-subtle">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>

                <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {[0, 5, 4, 3, 2, 1].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setReviewRating(rating)}
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                          reviewRating === rating
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-surface-muted text-fg-muted hover:text-fg',
                        )}
                      >
                        {rating ? `${rating} star` : 'All'}
                      </button>
                    ))}
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-fg-muted">
                    Sort
                    <select
                      value={reviewSort}
                      onChange={(event) => setReviewSort(event.target.value)}
                      className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg outline-none focus:border-brand-500"
                    >
                      <option value="recent">Most recent</option>
                      <option value="highest">Highest rated</option>
                      <option value="helpful">Most helpful</option>
                    </select>
                  </label>
                </div>

                {reviewList.length ? reviewList.map((review) => (
                  <Card key={review.id}>
                    <CardBody>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-bold text-fg-muted">
                            {(review.user_name || '?')[0].toUpperCase()}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-fg">
                              {review.user_name}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <Stars value={review.rating} />
                              <span className="text-xs text-fg-subtle">
                                {new Date(review.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {review.is_verified_purchase && (
                          <Badge tone="green" size="sm">
                            <CheckIcon className="h-3 w-3" />
                            Verified
                          </Badge>
                        )}
                      </div>

                      {review.title && (
                        <h3 className="mt-3.5 text-sm font-semibold text-fg">
                          {review.title}
                        </h3>
                      )}
                      {review.comment && (
                        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                          {review.comment}
                        </p>
                      )}
                      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-xs text-fg-subtle">
                        <span>Was this review helpful?</span>
                        <span className="rounded-full bg-surface-muted px-2.5 py-1 font-medium text-fg-muted">
                          Helpful · {review.helpful_count || 0}
                        </span>
                      </div>
                    </CardBody>
                  </Card>
                )) : (
                  <div className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
                    <p className="text-sm font-semibold text-fg">No {reviewRating}-star reviews yet</p>
                    <button
                      type="button"
                      onClick={() => setReviewRating(0)}
                      className="mt-2 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Show all reviews
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="No reviews yet"
                description="Be the first to share what you think of this product."
              />
            )}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            {!isAuthenticated ? (
              <Card>
                <CardBody className="text-sm text-fg-muted">
                  <Link
                    to="/login"
                    className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Sign in
                  </Link>{' '}
                  to write a review.
                </CardBody>
              </Card>
            ) : alreadyReviewed ? (
              <Alert tone="info">You have already reviewed this product.</Alert>
            ) : (
              <ReviewForm
                productId={product.id}
                onDone={() => {
                  queryClient.invalidateQueries({ queryKey: ['product-reviews', slug] })
                  queryClient.invalidateQueries({ queryKey: ['product', slug] })
                  queryClient.invalidateQueries({ queryKey: ['review-summary', slug] })
                }}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
