import { createContext, useCallback, useMemo, useRef, useState } from 'react'

import { CheckIcon, CloseIcon } from '../components/icons'
import { cn } from '../lib/cn'

export const ToastContext = createContext(null)

const TONES = {
  success: 'surface-success border-success-line',
  error: 'surface-danger border-danger-line',
  info: 'bg-info-bg text-info-fg border-info-line',
}

let nextId = 0

/**
 * Toasts for actions whose result happens away from where you clicked.
 *
 * Inline feedback is better when the result appears next to the control — a
 * field error belongs under the field. Toasts are for the cases where it
 * doesn't: approving a seller removes the row you just clicked, so an inline
 * message would unmount before it could be read.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Timers are held in a ref so dismissing early can cancel them; leaving them
  // running would fire setState on an already-removed toast.
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, { tone = 'success', duration = 4000 } = {}) => {
      const id = ++nextId
      setToasts((prev) => [...prev, { id, message, tone }])
      // Errors stay until dismissed. Auto-hiding the one message the user needs
      // to act on is the classic toast mistake.
      if (tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (m, o) => push(m, { ...o, tone: 'success' }),
      error: (m, o) => push(m, { ...o, tone: 'error' }),
      info: (m, o) => push(m, { ...o, tone: 'info' }),
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* aria-live so a screen reader announces the result without moving focus,
          which would interrupt whatever the user is doing next. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg',
              TONES[toast.tone] ?? TONES.info,
            )}
          >
            {toast.tone === 'success' && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />}
            <p className="min-w-0 flex-1 leading-relaxed">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
