import { useState } from 'react'
import { Link } from 'react-router-dom'

import { authApi } from '../../api/endpoints'
import { Alert, Button, Field, Input } from '../../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await authApi.forgotPassword(email.trim().toLowerCase())
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-line bg-surface p-8 shadow-sm">
        {sent ? (
          <>
            <h1 className="text-xl font-bold tracking-tight text-fg">
              Check your inbox
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              If an account exists for <strong>{email}</strong>, we've sent a reset link.
              It expires in an hour and works only once.
            </p>
            <p className="mt-3 text-sm text-fg-muted">
              Nothing arrived? Check your spam folder, or{' '}
              <button
                onClick={() => setSent(false)}
                className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                try a different address
              </button>
              .
            </p>
            <Button as={Link} to="/login" variant="secondary" className="mt-6 w-full">
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              Forgot your password?
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Alert>{error}</Alert>

              <Field label="Email" required>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>

              <Button type="submit" loading={submitting} size="lg" className="w-full">
                Send reset link
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-fg-muted">
              <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
