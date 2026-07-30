import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { orderApi, profileApi } from '../api/endpoints'
import { config } from '../config'
import { useCart } from '../hooks/useCart'
import { cn } from '../lib/cn'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Money,
  RadioCard,
  Skeleton,
  Textarea,
  Thumb,
} from '../components/ui'
import { CheckIcon, ShieldIcon, TruckIcon } from '../components/icons'

const PAYMENT_METHODS = [
  {
    value: 'cod',
    label: 'Cash on delivery',
    hint: 'Pay the courier when your parcel arrives.',
  },
  {
    value: 'card',
    label: 'Card',
    hint: 'Card processing arrives with the payments phase.',
  },
]

/* --------------------------------------------------------------- stepper */

function Stepper({ current }) {
  const steps = ['Cart', 'Delivery', 'Confirm']
  return (
    <ol className="mb-8 flex items-center gap-2 text-sm">
      {steps.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition',
                done && 'bg-brand-600 text-white',
                active && 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-950',
                !done && !active && 'bg-surface-muted text-fg-subtle',
              )}
            >
              {done ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                'whitespace-nowrap font-medium',
                active ? 'text-fg' : 'text-fg-subtle',
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span
                className={cn(
                  'ml-1 hidden h-px flex-1 sm:block',
                  done ? 'bg-brand-500' : 'bg-line',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------ new address */

function NewAddressForm({ onCreated, onCancel, canCancel }) {
  const [form, setForm] = useState({
    label: 'Home',
    full_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: config.defaultCountry,
    is_default: true,
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const create = useMutation({
    mutationFn: () => profileApi.createAddress(form),
    onSuccess: onCreated,
    onError: (err) => {
      setError(err.message)
      setFieldErrors(err.fields || {})
    },
  })

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate()
      }}
      className="space-y-4 rounded-xl border border-line bg-surface-muted p-4"
    >
      {error && <Alert>{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" hint="e.g. Home, Office">
          <Input value={form.label} onChange={update('label')} />
        </Field>
        <Field label="Full name" required error={fieldErrors.full_name}>
          <Input required value={form.full_name} onChange={update('full_name')} />
        </Field>
        <Field label="Phone" required error={fieldErrors.phone}>
          <Input required value={form.phone} onChange={update('phone')} />
        </Field>
        <Field label="Postal code" required error={fieldErrors.postal_code}>
          <Input required value={form.postal_code} onChange={update('postal_code')} />
        </Field>
      </div>

      <Field label="Address line" required error={fieldErrors.line1}>
        <Input required value={form.line1} onChange={update('line1')} />
      </Field>
      <Field label="Apartment, suite (optional)">
        <Input value={form.line2} onChange={update('line2')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="City" required error={fieldErrors.city}>
          <Input required value={form.city} onChange={update('city')} />
        </Field>
        <Field label="State / region">
          <Input value={form.state} onChange={update('state')} />
        </Field>
        <Field label="Country">
          <Input value={form.country} onChange={update('country')} />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={create.isPending}>
          Save address
        </Button>
        {canCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------- page */

export default function Checkout() {
  const cart = useCart()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [addressId, setAddressId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState([])

  const { data: addresses, isPending: loadingAddresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: profileApi.addresses,
  })

  // Preselect the default address so the common case is a single click.
  useEffect(() => {
    const list = addresses?.results ?? []
    if (!addressId && list.length) {
      setAddressId((list.find((a) => a.is_default) || list[0]).id)
    }
  }, [addresses]) // eslint-disable-line react-hooks/exhaustive-deps

  const placeOrder = useMutation({
    mutationFn: () =>
      orderApi.checkout({
        address: addressId,
        payment_method: paymentMethod,
        customer_note: note,
      }),
    onSuccess: (order) => {
      // The server emptied the cart, so drop our cached copy too.
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/orders/${order.number}?placed=1`, { replace: true })
    },
    onError: (err) => {
      setError(err.message)
      setIssues(err.raw?.issues || [])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  })

  if (cart.isLoading || loadingAddresses) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-44" />
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!cart.items.length) {
    return (
      <div className="py-10">
        <EmptyState
          title="Nothing to check out"
          description="Your cart is empty."
          action={
            <Button as={Link} to="/products">
              Browse products
            </Button>
          }
        />
      </div>
    )
  }

  const addressList = addresses?.results ?? []
  const blocked = cart.issues.length > 0
  const showForm = adding || addressList.length === 0

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        Checkout
      </h1>

      <Stepper current={1} />

      {(error || issues.length > 0) && (
        <div className="mb-6 space-y-2">
          {error && <Alert title="Couldn't place your order">{error}</Alert>}
          {issues.length > 0 && (
            <Alert tone="warning" title="Your cart needs attention">
              <ul className="mt-1 space-y-0.5">
                {issues.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Delivery address"
              subtitle="Where should this order go?"
              action={
                addressList.length > 0 &&
                !showForm && (
                  <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                    Add new
                  </Button>
                )
              }
            />
            <CardBody>
              {showForm ? (
                <NewAddressForm
                  canCancel={addressList.length > 0}
                  onCreated={(address) => {
                    queryClient.invalidateQueries({ queryKey: ['addresses'] })
                    setAddressId(address.id)
                    setAdding(false)
                  }}
                  onCancel={() => setAdding(false)}
                />
              ) : (
                <div className="space-y-2.5">
                  {addressList.map((address) => (
                    <RadioCard
                      key={address.id}
                      name="address"
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-fg">{address.full_name}</span>
                        {address.label && (
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                            {address.label}
                          </span>
                        )}
                        {address.is_default && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-fg-muted">
                        {address.line1}
                        {address.line2 && `, ${address.line2}`}, {address.city}{' '}
                        {address.postal_code}, {address.country}
                      </p>
                      <p className="mt-0.5 text-fg-subtle">{address.phone}</p>
                    </RadioCard>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment method" />
            <CardBody className="space-y-2.5">
              {PAYMENT_METHODS.map((method) => (
                <RadioCard
                  key={method.value}
                  name="payment"
                  checked={paymentMethod === method.value}
                  onChange={() => setPaymentMethod(method.value)}
                >
                  <span className="block font-semibold text-fg">{method.label}</span>
                  <span className="block text-xs text-fg-subtle">{method.hint}</span>
                </RadioCard>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Order note" subtitle="Optional — visible to the seller" />
            <CardBody>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="Delivery instructions, gift message, preferred time…"
              />
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------------------------------- summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader
              title="Order summary"
              subtitle={`${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'}`}
            />

            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {cart.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <Thumb
                    src={item.product.primary_image}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-line"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {item.product.seller_name} · ×{item.quantity}
                    </p>
                  </div>
                  <Money amount={item.line_total} className="text-sm font-semibold" />
                </li>
              ))}
            </ul>

            <CardBody className="space-y-5 border-t border-line">
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Subtotal</dt>
                  <dd className="font-semibold text-fg">
                    <Money amount={cart.subtotal} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Delivery</dt>
                  <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Free
                  </dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-3">
                  <dt className="text-base font-semibold text-fg">Total</dt>
                  <dd>
                    <Money amount={cart.subtotal} size="lg" className="font-bold text-fg" />
                  </dd>
                </div>
              </dl>

              {blocked && (
                <Alert tone="warning">
                  Your cart has unresolved issues.{' '}
                  <Link to="/cart" className="font-semibold underline underline-offset-2">
                    Review cart
                  </Link>
                </Alert>
              )}

              <Button
                size="lg"
                className="w-full"
                loading={placeOrder.isPending}
                disabled={!addressId || blocked}
                onClick={() => {
                  setError('')
                  setIssues([])
                  placeOrder.mutate()
                }}
              >
                Place order · <Money amount={cart.subtotal} />
              </Button>

              {!addressId && (
                <p className="text-center text-xs text-fg-subtle">
                  Add a delivery address to continue.
                </p>
              )}

              <div className="space-y-2 border-t border-line pt-4 text-xs text-fg-subtle">
                <p className="flex items-center gap-2">
                  <ShieldIcon className="h-3.5 w-3.5" />
                  Stock is locked and verified as your order is created
                </p>
                <p className="flex items-center gap-2">
                  <TruckIcon className="h-3.5 w-3.5" />
                  Cancel any time before the seller packs it
                </p>
              </div>
            </CardBody>
          </Card>

          <Button as={Link} to="/cart" variant="ghost" className="mt-3 w-full">
            ← Back to cart
          </Button>
        </aside>
      </div>
    </div>
  )
}
