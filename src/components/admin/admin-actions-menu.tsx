'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, X } from 'lucide-react'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'

export function AdminActionsMenu({ children, label = 'Действия' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative z-50">
      <button
        type="button"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-5 w-5" />
        <span>{label}</span>
      </button>
      {mounted ? createPortal(
        <div
          className={open
            ? 'fixed inset-0 z-[150] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-[2px]'
            : 'hidden'}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-black/30 dark:border-white/10 dark:bg-surface-950"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div>
                <div className="font-semibold">{label}</div>
                <div className="text-xs text-slate-500">Выберите действие с аккаунтом</div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="Закрыть меню"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="grid max-h-[min(65dvh,32rem)] gap-2 overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] [&_a]:w-full [&_button]:w-full [&_.btn-secondary]:justify-start [&_.btn-primary]:justify-start"
              onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest('button, a')) setOpen(false)
              }}
            >
              {children}
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </div>
  )
}
