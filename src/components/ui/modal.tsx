'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { isTopDialogLayer, registerDialogLayer } from '@/lib/dialog-stack'
import { Button } from './button'

export interface ModalProps {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  variant?: 'dialog' | 'sheet'
  overlayClassName?: string
  panelClassName?: string
  bodyClassName?: string
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  variant = 'dialog',
  overlayClassName,
  panelClassName,
  bodyClassName,
  initialFocusRef,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false)
  const titleId = React.useId()
  const descriptionId = React.useId()
  const dialogRef = React.useRef<HTMLDivElement | null>(null)
  const onCloseRef = React.useRef(onClose)
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null)
  const dialogLayerRef = React.useRef(Symbol('modal'))

  useBodyScrollLock(open)

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!open) return
    const layerId = dialogLayerRef.current
    const unregisterLayer = registerDialogLayer(layerId)
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    window.setTimeout(() => {
      const preferred = initialFocusRef?.current
      const firstFocusable = getFocusableElements(dialogRef.current)[0]
      ;(preferred ?? firstFocusable ?? dialogRef.current)?.focus()
    }, 0)

    function onKeyDown(event: KeyboardEvent) {
      if (!isTopDialogLayer(layerId)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(dialogRef.current)
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      unregisterLayer()
      previouslyFocusedRef.current?.focus()
      previouslyFocusedRef.current = null
    }
  }, [initialFocusRef, open])

  if (!mounted || !open) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[160] grid place-items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-4',
        overlayClassName,
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950',
          variant === 'sheet'
            ? 'h-auto max-h-[94dvh] rounded-t-3xl border border-b-0 border-slate-200 dark:border-white/10 sm:max-h-[calc(100dvh-24px)] sm:max-w-lg sm:rounded-2xl sm:border'
            : 'h-dvh max-h-dvh border-0 sm:h-auto sm:max-h-[calc(100dvh-24px)] sm:max-w-lg sm:rounded-2xl sm:border sm:border-slate-200 dark:sm:border-white/10',
          panelClassName,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-950 dark:text-white">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Закрыть" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4', bodyClassName)}>
          {children}
        </div>
        {footer ? <div className="shrink-0 border-t border-slate-200 px-5 py-4 dark:border-white/10">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
}
