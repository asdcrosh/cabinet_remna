'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { isTopDialogLayer, registerDialogLayer } from '@/lib/dialog-stack'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function AdminModal({
  open,
  title,
  description,
  onClose,
  children,
  size = 'lg',
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  const [mounted, setMounted] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const dialogLayerRef = useRef(Symbol('admin-modal'))

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const layerId = dialogLayerRef.current
    const unregisterLayer = registerDialogLayer(layerId)
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    window.setTimeout(() => {
      dialogRef.current?.focus()
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialogLayer(layerId)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
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
  }, [open])

  if (!mounted || !open) return null

  const widths = {
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-[160] flex h-dvh w-dvw items-end justify-center p-0 sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Закрыть окно"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative z-10 flex h-auto max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-slate-200 bg-white shadow-[0_32px_90px_rgba(15,23,42,.26)] dark:border-white/10 dark:bg-surface-900 sm:max-h-[calc(100dvh-40px)] sm:rounded-[16px] sm:border ${widths[size]}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {children}
        </div>
      </section>
    </div>,
    document.body
  )
}

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
}
