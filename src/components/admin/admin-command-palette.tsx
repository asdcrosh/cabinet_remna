'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, CreditCard, LayoutGrid, Loader2, Search, SearchX, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import {
  COMMAND_PALETTE_MAX_QUERY_LENGTH,
  buildCommandPaletteGroups,
  flattenCommandPaletteOptions,
  isCommandPaletteShortcut,
  isEditableTarget,
  moveActiveIndex,
  parseAdminSearchResults,
  shouldSearchRemotely,
  type AdminSearchResults,
  type CommandPaletteItem,
  type CommandPaletteOption,
} from './admin-command-palette-model'

export type { CommandPaletteItem } from './admin-command-palette-model'

const SEARCH_DEBOUNCE_MS = 200

type RemoteState =
  | { status: 'idle' }
  | { status: 'error'; query: string }
  | { status: 'done'; query: string; results: AdminSearchResults }

export function AdminCommandPalette({
  items,
  canSearch,
  className,
}: {
  items: CommandPaletteItem[]
  canSearch: boolean
  className?: string
}) {
  const router = useRouter()
  const baseId = useId()
  const titleId = `${baseId}-title`
  const listboxId = `${baseId}-listbox`
  const shortcutLabel = useShortcutLabel()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [remote, setRemote] = useState<RemoteState>({ status: 'idle' })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const trimmedQuery = query.trim()
  const remoteEnabled = shouldSearchRemotely(trimmedQuery, canSearch)
  const remoteForQuery = remoteEnabled && remote.status !== 'idle' && remote.query === trimmedQuery ? remote : null
  const results = remoteForQuery?.status === 'done' ? remoteForQuery.results : null
  const failed = remoteForQuery?.status === 'error'
  const loading = remoteEnabled && !remoteForQuery

  const groups = useMemo(
    () => buildCommandPaletteGroups({ items, query, results }),
    [items, query, results],
  )
  const options = useMemo(() => flattenCommandPaletteOptions(groups), [groups])
  const indexByKey = useMemo(() => new Map(options.map((option, index) => [option.key, index])), [options])
  const activeIndex = options.length === 0 ? -1 : (activeKey ? indexByKey.get(activeKey) : undefined) ?? 0
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined
  const optionId = (index: number) => `${baseId}-option-${index}`

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveKey(null)
    setRemote({ status: 'idle' })
  }, [])

  const openPalette = useCallback((returnFocus: HTMLElement | null) => {
    returnFocusRef.current = returnFocus
    setOpen(true)
  }, [])

  useBodyScrollLock(open)
  useDialogFocus({ open, onClose: close, dialogRef, initialFocusRef: inputRef, returnFocusRef })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || !isCommandPaletteShortcut(event)) return
      const insidePalette = Boolean(
        dialogRef.current && event.target instanceof Node && dialogRef.current.contains(event.target),
      )
      if (!insidePalette && isEditableTarget(event.target)) return
      // Не открываемся поверх чужого модального окна.
      if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.preventDefault()
      if (open) {
        close()
      } else {
        openPalette(null)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, open, openPalette])

  useEffect(() => {
    if (!open || !remoteEnabled) return

    const controller = new AbortController()
    const searchQuery = trimmedQuery
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(searchQuery)}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'x-error-presentation': 'silent' },
        })
        const data = await response.json().catch(() => null)
        if (controller.signal.aborted) return
        const parsed = response.ok ? parseAdminSearchResults(data) : null
        setRemote(parsed
          ? { status: 'done', query: searchQuery, results: parsed }
          : { status: 'error', query: searchQuery })
      } catch {
        if (controller.signal.aborted) return
        setRemote({ status: 'error', query: searchQuery })
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, remoteEnabled, trimmedQuery])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, baseId, open])

  function navigate(option: CommandPaletteOption | undefined) {
    if (!option) return
    close()
    router.push(option.href)
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = moveActiveIndex(activeIndex, event.key === 'ArrowDown' ? 1 : -1, options.length)
      setActiveKey(options[next]?.key ?? null)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      navigate(activeOption)
    }
  }

  const statusMessage = loading && options.length === 0
    ? 'Ищем клиентов и платежи…'
    : options.length === 0
      ? 'Ничего не найдено'
      : `Найдено: ${options.length}`

  const dialog = (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-3 pt-[max(1rem,8vh)] sm:px-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Закрыть поиск"
        className="absolute inset-0 cursor-default bg-slate-950/40"
        onClick={close}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.55)] outline-none dark:border-white/10 dark:bg-surface-950"
      >
        <h2 id={titleId} className="sr-only">Поиск по админке</h2>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-label="Поиск по админке"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={COMMAND_PALETTE_MAX_QUERY_LENGTH}
            value={query}
            placeholder={canSearch ? 'Email, @telegram, платёж или раздел' : 'Название раздела'}
            className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white sm:text-sm"
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveKey(null)
            }}
            onKeyDown={onInputKeyDown}
          />
          <kbd className="hidden shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-400 dark:border-white/10 sm:inline-block">
            Esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <div id={listboxId} role="listbox" aria-label="Результаты поиска" className={cn(options.length === 0 && 'hidden')}>
            {groups.map((group, groupIndex) => {
              const headingId = `${baseId}-group-${groupIndex}`
              return (
                <div key={group.key} role="presentation" className="mb-1 last:mb-0">
                  <div
                    id={headingId}
                    aria-hidden="true"
                    className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
                  >
                    {group.label}
                  </div>
                  <div role="group" aria-labelledby={headingId}>
                    {group.options.map((option) => {
                      const index = indexByKey.get(option.key) ?? -1
                      const active = index === activeIndex
                      return (
                        <div
                          key={option.key}
                          id={optionId(index)}
                          role="option"
                          aria-selected={active}
                          className={cn(
                            'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors',
                            active
                              ? 'bg-brand-50 text-slate-950 dark:bg-white/[0.08] dark:text-white'
                              : 'text-slate-700 dark:text-slate-300',
                          )}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseMove={() => {
                            if (!active) setActiveKey(option.key)
                          }}
                          onClick={() => navigate(option)}
                        >
                          <OptionIcon kind={option.kind} active={active} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{option.label}</span>
                            {option.description ? (
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{option.description}</span>
                            ) : null}
                          </span>
                          <CornerDownLeft
                            className={cn('h-3.5 w-3.5 shrink-0 text-slate-400', active ? 'opacity-100' : 'opacity-0')}
                            aria-hidden="true"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {loading && options.length > 0 ? (
            <div className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Ищем клиентов и платежи…
            </div>
          ) : null}

          {loading && options.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Ищем клиентов и платежи…
            </div>
          ) : null}

          {!loading && options.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <SearchX className="h-6 w-6 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <div className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Ничего не найдено</div>
              {canSearch ? (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Попробуйте email, @telegram или номер платежа</div>
              ) : null}
            </div>
          ) : null}

          {failed ? (
            <div className="px-2.5 pb-1 pt-2 text-xs text-slate-500 dark:text-slate-400">
              Не удалось найти клиентов и платежи. Попробуйте ещё раз.
            </div>
          ) : null}
        </div>

        <div className="hidden items-center gap-4 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-white/10 sm:flex">
          <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> выбрать</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>Enter</Kbd> открыть</span>
          <span className="inline-flex items-center gap-1.5"><Kbd>Esc</Kbd> закрыть</span>
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {trimmedQuery ? statusMessage : ''}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          'flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-left text-sm text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
          className,
        )}
        onClick={() => openPalette(triggerRef.current)}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Найти…</span>
        <kbd className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-400">
          {shortcutLabel}
        </kbd>
      </button>
      {open ? createPortal(dialog, document.body) : null}
    </>
  )
}

function OptionIcon({ kind, active }: { kind: CommandPaletteOption['kind']; active: boolean }) {
  const Icon = kind === 'user' ? UserRound : kind === 'payment' ? CreditCard : LayoutGrid
  return (
    <span
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
        active
          ? 'bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-brand-300'
          : 'bg-slate-100 text-slate-500 dark:bg-white/[0.05] dark:text-slate-400',
      )}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" />
    </span>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-slate-200 px-1 font-sans text-[10px] font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
      {children}
    </kbd>
  )
}

function subscribeNoop() {
  return () => {}
}

function getShortcutLabel() {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    || navigator.platform
    || ''
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘K' : 'Ctrl K'
}

function getServerShortcutLabel() {
  return '⌘K'
}

// На сервере подсказка всегда ⌘K, после гидрации — по платформе пользователя.
function useShortcutLabel() {
  return useSyncExternalStore(subscribeNoop, getShortcutLabel, getServerShortcutLabel)
}
