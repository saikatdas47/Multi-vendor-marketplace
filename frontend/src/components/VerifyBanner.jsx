import { useState } from 'react'

import { authApi } from '../api/endpoints'
import { useAuth } from '../hooks/useAuth'
import { CloseIcon } from './icons'

export default function VerifyBanner() {
  const { user, isAuthenticated } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')

  if (!isAuthenticated || user.email_verified || dismissed) return null

  async function resend() {
    setState('sending')
    try {
      const data = await authApi.sendVerification()
      setMessage(data.detail)
      setState('sent')
    } catch (err) {
      setMessage(err.message)
      setState('error')
    }
  }

  return (
    <div className="border-b border-warning-line bg-warning-bg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm text-warning-fg sm:px-6 lg:px-8">
        <span className="flex min-w-0 items-center gap-2">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2.5 6.4V14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V6.4l-6.6 4.1a1.5 1.5 0 0 1-1.8 0z" />
            <path d="M17.4 4.6A2 2 0 0 0 15.5 3h-11a2 2 0 0 0-1.9 1.6L10 9.2z" />
          </svg>
          {state === 'sent' || state === 'error' ? (
            <span>{message}</span>
          ) : (
            <span className="truncate">
              Verify your email to secure your account —{' '}
              <span className="font-semibold">{user.email}</span>
            </span>
          )}
        </span>

        {state !== 'sent' && (
          <button
            onClick={resend}
            disabled={state === 'sending'}
            className="font-semibold underline underline-offset-2 transition hover:no-underline disabled:opacity-50"
          >
            {state === 'sending' ? 'Sending…' : 'Resend email'}
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
