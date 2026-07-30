import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import AuthShell from '../../components/AuthShell'
import { useAuth } from '../../hooks/useAuth'
import { Alert, Button, Field, Input } from '../../components/ui'
import { canRoleVisit, homeFor } from '../../lib/roles'

const DEMO_LOGINS = [
  { role: 'Customer', email: 'customer1@commercex.test', password: 'Customer!2345' },
  { role: 'Seller', email: 'seller1@commercex.test', password: 'Seller!2345' },
  { role: 'Admin', email: 'admin@commercex.test', password: 'Admin!2345' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const intended = location.state?.from?.pathname

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      const user = await login(form.email.trim().toLowerCase(), form.password)
      // Honour where they were headed only if their role can actually go there.
      // Otherwise a customer bounced off /seller would be sent straight back to
      // /seller and bounce again.
      const target =
        intended && canRoleVisit(user.role, intended) ? intended : homeFor(user.role)
      navigate(target, { replace: true })
    } catch (err) {
      setError(err.message)
      setFieldErrors(err.fields || {})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue shopping."
      footer={
        <>
          No account yet?{' '}
          <Link
            to="/register"
            className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Email" required error={fieldErrors.email} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
            invalid={Boolean(fieldErrors.email)}
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Password"
          required
          error={fieldErrors.password}
          htmlFor="password"
          labelAction={
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Forgot password?
            </Link>
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={update('password')}
            invalid={Boolean(fieldErrors.password)}
            placeholder="••••••••"
          />
        </Field>

        <Button type="submit" loading={submitting} size="lg" className="w-full">
          Sign in
        </Button>
      </form>

      {/* One-click demo logins. A recruiter opening this project should never
          have to guess credentials. */}
      <div className="mt-7 border-t border-line pt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          Demo accounts
        </p>
        <div className="grid gap-2">
          {DEMO_LOGINS.map((demo) => (
            <button
              key={demo.email}
              type="button"
              onClick={() => setForm({ email: demo.email, password: demo.password })}
              className="flex items-center justify-between rounded-lg border border-line bg-surface-muted px-3 py-2 text-left text-xs transition hover:border-brand-300 hover:bg-surface dark:hover:border-brand-700"
            >
              <span className="font-semibold text-fg">{demo.role}</span>
              <span className="truncate text-fg-subtle">{demo.email}</span>
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-xs text-fg-subtle">
          Requires <code className="font-mono">manage.py seed_demo</code>. Click to fill,
          then sign in.
        </p>
      </div>
    </AuthShell>
  )
}
