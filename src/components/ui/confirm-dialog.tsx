'use client'

import { useRef, type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { Modal } from './modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  tone?: 'danger' | 'warning' | 'neutral'
  details?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  loading = false,
  tone = 'danger',
  details,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const danger = tone === 'danger'
  const warning = tone === 'warning'

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      variant="sheet"
      panelClassName="sm:max-w-md"
      bodyClassName="py-3"
      initialFocusRef={cancelButtonRef}
      onClose={() => {
        if (!loading) onCancel()
      }}
      footer={(
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button ref={cancelButtonRef} variant="secondary" disabled={loading} onClick={onCancel}>
            Отмена
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={loading} onClick={onConfirm}>
            {loading ? 'Выполняем...' : confirmLabel}
          </Button>
        </div>
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3 border-l-2 py-1 pl-3 text-sm leading-6',
          danger && 'border-red-400 text-red-800 dark:text-red-200',
          warning && 'border-amber-400 text-amber-800 dark:text-amber-200',
          tone === 'neutral' && 'border-cyan-400 text-slate-700 dark:text-slate-200',
        )}
      >
        {danger || warning
          ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
        <div>
          {details ?? (danger
            ? 'После подтверждения отменить это действие автоматически не получится.'
            : 'Проверьте параметры перед продолжением.')}
        </div>
      </div>
    </Modal>
  )
}
