'use client'

import { useEffect, useState } from 'react'
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

  useBodyScrollLock(open)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 grid h-dvh w-dvw place-items-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-2xl dark:bg-surface-900">
        <div className="mb-4 flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={loading} onClick={onCancel}>Отмена</button>
          <button className="btn-danger" disabled={loading} onClick={onConfirm}>
            {loading ? 'Выполняем...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
