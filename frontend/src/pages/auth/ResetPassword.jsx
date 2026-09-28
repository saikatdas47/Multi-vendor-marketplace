import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { authApi } from '../../api/endpoints'
import { Alert, Button, Field, Input } from '../../components/ui'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [form, setForm] = useState({ new_password: '', new_password_confirm: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const mismatch =
    form.new_password_confirm.length > 0 &&
    form.new_password !== form.new_password_confirm

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})

    if (mismatch) {
      setFieldErrors({ new_password_confirm: 'Passwords do not match.' })
      return
    }

    setSubmitting(true)
    try {
      await authApi.resetPassword({ token, ...form })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(err.message)
      setFieldErrors(err.fields || {})
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-fg">Invalid reset link</h1>
        <p className="mt-2 text-sm text-fg-muted">
          This link is missing its token. Request a new one.
        </p>
        <Button as={Link} to="/forgot-password" className="mt-6">
          Request a reset link
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-line bg-surface p-8 shadow-sm">
        {done ? (
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
              ✓
            </div>
            <h1 className="mt-4 text-xl font-bold text-fg">Password updated</h1>
            <p className="mt-1 text-sm text-fg-muted">
              All other sessions have been signed out. Taking you to sign in…
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              Choose a new password
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              This will sign out any other devices.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Alert>{error}</Alert>

              <Field
                label="New password"
                required
                error={fieldErrors.new_password}
                hint="At least 8 characters, not too common."
              >
                <Input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={form.new_password}
                  onChange={update('new_password')}
                  invalid={Boolean(fieldErrors.new_password)}
                />
              </Field>

              <Field
                label="Confirm new password"
                required
                error={
                  fieldErrors.new_password_confirm ||
                  (mismatch ? 'Passwords do not match.' : '')
                }
              >
                <Input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.new_password_confirm}
                  onChange={update('new_password_confirm')}
                  invalid={mismatch || Boolean(fieldErrors.new_password_confirm)}
                />
              </Field>

              <Button type="submit" loading={submitting} size="lg" className="w-full">
                Update password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
