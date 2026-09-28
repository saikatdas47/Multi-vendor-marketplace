import { useEffect, useRef } from 'react'

import { Button } from './ui'
import { cn } from '../lib/cn'

/**
 * Modal confirmation for destructive or irreversible actions.
 *
 * Accessibility is the reason this is a component rather than `window.confirm`
 * calls scattered around: focus has to move into the dialog, Tab must not escape
 * it, Escape must close it, and focus must return to whatever opened it. Getting
 * that wrong strands keyboard users behind an invisible modal.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
  children,
}) {
  const panelRef = useRef(null)
  const confirmRef = useRef(null)
  const restoreTo = useRef(null)

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement
    // Focus the confirm button, not the panel: it is the action the dialog
    // exists for. `cancel` stays one Shift+Tab away.
    const focusTimer = setTimeout(() => confirmRef.current?.focus(), 20)

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel?.()
        return
      }
      if (event.key !== 'Tab') return

      // Trap Tab inside the panel by wrapping at both ends.
      const focusable = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      // Return focus where it came from, so dismissing does not dump the user
      // at the top of the document.
      if (restoreTo.current instanceof HTMLElement) restoreTo.current.focus()
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button
        aria-label="Cancel"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 animate-fade-in bg-overlay"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-description' : undefined}
        className="relative w-full max-w-md animate-fade-up rounded-card border border-line bg-surface p-5 shadow-lg"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-fg">
          {title}
        </h2>
        {description && (
          <p id="confirm-description" className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            {description}
          </p>
        )}

        {children && <div className="mt-4">{children}</div>}

        <div className={cn('mt-5 flex justify-end gap-2')}>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
