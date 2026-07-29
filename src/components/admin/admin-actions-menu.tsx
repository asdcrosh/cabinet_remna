'use client'

import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, X } from 'lucide-react'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { isTopDialogLayer, registerDialogLayer } from '@/lib/dialog-stack'

const ACTION_SELECTOR = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export function AdminActionsMenu({
  children,
  label = 'Действия',
  compact = false,
}: {
  children: ReactNode
  label?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const dialogLayerRef = useRef(Symbol('actions-menu'))

  useEffect(() => {
    setMounted(true)
    const media = window.matchMedia('(max-width: 639px)')
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useBodyScrollLock(open && mobile)

  useEffect(() => {
    if (!open) return
    const layerId = dialogLayerRef.current
    const unregisterLayer = registerDialogLayer(layerId)
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = window.requestAnimationFrame(() => {
      getActionElements(menuRef.current)[0]?.focus()
    })

    function onKeyDown(event: KeyboardEvent) {
      if (!isTopDialogLayer(layerId)) return
      const actions = getActionElements(menuRef.current)
      const currentIndex = actions.indexOf(document.activeElement as HTMLElement)

      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (actions.length === 0) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const fallback = direction > 0 ? -1 : 0
        const nextIndex = (Math.max(currentIndex, fallback) + direction + actions.length) % actions.length
        actions[nextIndex]?.focus()
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        actions[event.key === 'Home' ? 0 : actions.length - 1]?.focus()
        return
      }
      if (!mobile || event.key !== 'Tab' || actions.length === 0) return
      const first = actions[0]
      const last = actions[actions.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      unregisterLayer()
      previouslyFocusedRef.current?.focus()
      previouslyFocusedRef.current = null
    }
  }, [mobile, open])

  useEffect(() => {
    if (!open || mobile) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    function close() {
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [mobile, open])

  useLayoutEffect(() => {
    if (!open || mobile || !triggerRef.current || !menuRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = menuRef.current.offsetHeight
    const below = rect.bottom + 8
    const top = below + menuHeight <= window.innerHeight - 12
      ? below
      : Math.max(12, rect.top - menuHeight - 8)
    const left = Math.max(12, Math.min(rect.right - 224, window.innerWidth - 236))
    setAnchor({ top, left })
  }, [mobile, open])

  const actionList = (
    <div
      className="grid gap-1 p-2 [&_a]:w-full [&_button]:w-full [&_.btn-secondary]:min-h-10 [&_.btn-secondary]:justify-start [&_.btn-primary]:min-h-10 [&_.btn-primary]:justify-start"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a')) setOpen(false)
      }}
    >
      {children}
    </div>
  )

  return (
    <div ref={rootRef} className="relative z-50">
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] ${compact ? 'w-10 px-0' : 'px-3'}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            const estimatedHeight = 180
            const below = rect.bottom + 8
            setAnchor({
              top: below + estimatedHeight <= window.innerHeight - 12
                ? below
                : Math.max(12, rect.top - estimatedHeight - 8),
              left: Math.max(12, Math.min(rect.right - 224, window.innerWidth - 236)),
            })
          }
          setOpen((value) => !value)
        }}
      >
        <MoreHorizontal className="h-5 w-5" />
        <span className={compact ? 'sr-only' : ''}>{label}</span>
      </button>
      {mounted && !mobile ? createPortal(
        <section
          ref={menuRef}
          role="dialog"
          aria-modal="false"
          aria-label={label}
          aria-hidden={!open}
          className={`${open ? 'block' : 'hidden'} fixed z-[160] max-h-[calc(100dvh-1.5rem)] w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-white/10 dark:bg-surface-950 dark:shadow-black/30`}
          style={{ top: anchor.top, left: anchor.left }}
        >
          {actionList}
        </section>,
        document.body
      ) : null}
      {mounted && mobile ? createPortal(
        <div
          aria-hidden={!open}
          className={`${open ? 'flex' : 'hidden'} fixed inset-0 z-[150] items-end justify-center bg-slate-950/55 p-3 backdrop-blur-[2px]`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <section
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/30 dark:border-white/10 dark:bg-surface-950"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div>
                <div className="font-semibold">{label}</div>
                <div className="text-xs text-slate-500">Выберите действие</div>
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
            <div className="max-h-[min(65dvh,32rem)] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              {actionList}
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </div>
  )
}

function getActionElements(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(ACTION_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null)
}
