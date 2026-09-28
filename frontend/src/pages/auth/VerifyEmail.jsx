import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { authApi } from '../../api/endpoints'
import { useAuth } from '../../hooks/useAuth'
import { Alert, Button, Spinner } from '../../components/ui'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { isAuthenticated, refreshUser } = useAuth()

  const [state, setState] = useState(token ? 'verifying' : 'missing')
  const [error, setError] = useState('')

  // StrictMode double-mounts in development; the token is single-use, so
  // guard against firing the request twice.
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true

    authApi
      .verifyEmail(token)
      .then(async () => {
        setState('done')
        if (isAuthenticated) await refreshUser()
      })
      .catch((err) => {
        setError(err.message)
        setState('failed')
      })
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        {state === 'verifying' && (
          <>
            <Spinner className="mx-auto h-8 w-8 text-brand-600 dark:text-brand-400" />
            <p className="mt-4 text-sm text-fg-muted">Confirming your email…</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
              ✓
            </div>
            <h1 className="mt-4 text-xl font-bold text-fg">Email verified</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Thanks — your account is fully active.
            </p>
            <Button as={Link} to={isAuthenticated ? '/' : '/login'} className="mt-6">
              {isAuthenticated ? 'Start shopping' : 'Sign in'}
            </Button>
          </>
        )}

        {(state === 'failed' || state === 'missing') && (
          <>
            <h1 className="text-xl font-bold text-fg">Verification failed</h1>
            <div className="mt-4 text-left">
              <Alert>
                {state === 'missing'
                  ? 'This link is missing its token. Use the link from your email.'
                  : error}
              </Alert>
            </div>
            <p className="mt-4 text-sm text-fg-muted">
              Verification links expire after 48 hours and work only once.
            </p>
            {isAuthenticated ? (
              <Button as={Link} to="/account" variant="secondary" className="mt-6">
                Request a new link
              </Button>
            ) : (
              <Button as={Link} to="/login" variant="secondary" className="mt-6">
                Sign in to resend
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
