'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useBodyScrollLock(open)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [loading, onCancel, open])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid h-dvh w-dvw place-items-center bg-slate-950/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl dark:bg-surface-900"
      >
        <div className="mb-4 flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 id={titleId} className="font-semibold">{title}</h2>
            <p id={descriptionId} className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button ref={cancelButtonRef} className="btn-secondary" disabled={loading} onClick={onCancel}>Отмена</button>
          <button className="btn-danger" disabled={loading} onClick={onConfirm}>
            {loading ? 'Выполняем...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
