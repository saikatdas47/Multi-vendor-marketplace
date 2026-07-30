import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import AuthShell from '../../components/AuthShell'
import { useAuth } from '../../hooks/useAuth'
import { homeFor } from '../../lib/roles'
import { Alert, Button, Field, Input } from '../../components/ui'

const ROLES = [
  {
    value: 'customer',
    title: 'I want to buy',
    description: 'Browse the catalogue, review products, place orders.',
  },
  {
    value: 'seller',
    title: 'I want to sell',
    description: 'Open a storefront. Needs admin approval before publishing.',
  },
]

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    role: 'customer',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    shop_name: '',
    password: '',
    password_confirm: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const mismatch =
    form.password_confirm.length > 0 && form.password !== form.password_confirm

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})

    if (mismatch) {
      setFieldErrors({ password_confirm: 'Passwords do not match.' })
      return
    }

    setSubmitting(true)
    try {
      const payload = { ...form, email: form.email.trim().toLowerCase() }
      if (payload.role !== 'seller') delete payload.shop_name
      const user = await register(payload)
      navigate(homeFor(user.role), { replace: true })
    } catch (err) {
      setError(err.message)
      setFieldErrors(err.fields || {})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Takes less than a minute."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg">Account type</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((role) => (
                <label
                  key={role.value}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    form.role === role.value
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-950/40'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    className="sr-only"
                    value={role.value}
                    checked={form.role === role.value}
                    onChange={update('role')}
                  />
                  <span className="block text-sm font-semibold text-fg">{role.title}</span>
                  <span className="mt-1 block text-xs text-fg-muted">{role.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={fieldErrors.first_name}>
              <Input value={form.first_name} onChange={update('first_name')} autoComplete="given-name" />
            </Field>
            <Field label="Last name" error={fieldErrors.last_name}>
              <Input value={form.last_name} onChange={update('last_name')} autoComplete="family-name" />
            </Field>
          </div>

          <Field label="Email" required error={fieldErrors.email}>
            <Input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              invalid={Boolean(fieldErrors.email)}
            />
          </Field>

          <Field label="Phone" error={fieldErrors.phone}>
            <Input value={form.phone} onChange={update('phone')} autoComplete="tel" />
          </Field>

          {form.role === 'seller' && (
            <Field
              label="Shop name"
              required
              error={fieldErrors.shop_name}
              hint="Your storefront needs admin approval before products go live."
            >
              <Input
                required
                value={form.shop_name}
                onChange={update('shop_name')}
                invalid={Boolean(fieldErrors.shop_name)}
                placeholder="Gadget Hub"
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Password"
              required
              error={fieldErrors.password}
              hint="At least 8 characters."
            >
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={update('password')}
                invalid={Boolean(fieldErrors.password)}
              />
            </Field>
            <Field
              label="Confirm password"
              required
              error={fieldErrors.password_confirm || (mismatch ? 'Passwords do not match.' : '')}
            >
              <Input
                type="password"
                required
                autoComplete="new-password"
                value={form.password_confirm}
                onChange={update('password_confirm')}
                invalid={mismatch || Boolean(fieldErrors.password_confirm)}
              />
            </Field>
          </div>

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Create account
          </Button>
        </form>
    </AuthShell>
  )
}
