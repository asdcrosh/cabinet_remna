'use client'

import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react'
import { Activity, CreditCard, Palette, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type SystemTabId = 'health' | 'branding' | 'features' | 'payments'

type SystemTab = {
  id: SystemTabId
  title: string
  description: string
  badge: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
  keywords?: string[]
  children: ReactNode
}

const icons: Record<SystemTabId, ComponentType<{ className?: string }>> = {
  health: Activity,
  branding: Palette,
  features: SlidersHorizontal,
  payments: CreditCard,
}

export function AdminSystemTabs({ tabs }: { tabs: SystemTab[] }) {
  const [activeId, setActiveId] = useState<SystemTabId>(tabs[0]?.id ?? 'health')
  const [query, setQuery] = useState('')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')
  const visibleTabs = normalizedQuery
    ? tabs.filter((tab) => [tab.title, tab.description, tab.badge, ...(tab.keywords ?? [])]
      .join(' ')
      .toLocaleLowerCase('ru-RU')
      .includes(normalizedQuery))
    : tabs

  useEffect(() => {
    const hash = window.location.hash.slice(1) as SystemTabId
    if (tabs.some((tab) => tab.id === hash)) setActiveId(hash)
  }, [tabs])

  function activateTab(id: SystemTabId) {
    setActiveId(id)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`)
  }

  function selectTab(index: number) {
    const tab = visibleTabs[index]
    if (!tab) return
    activateTab(tab.id)
    window.requestAnimationFrame(() => tabRefs.current[index]?.focus())
  }

  function updateQuery(value: string) {
    setQuery(value)
    const normalized = value.trim().toLocaleLowerCase('ru-RU')
    if (!normalized) return
    const firstMatch = tabs.find((tab) => [tab.title, tab.description, tab.badge, ...(tab.keywords ?? [])]
      .join(' ')
      .toLocaleLowerCase('ru-RU')
      .includes(normalized))
    if (firstMatch) activateTab(firstMatch.id)
  }

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="admin-system-nav lg:sticky lg:top-4 lg:z-20">
        <label className="relative block">
          <span className="sr-only">Найти настройку</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="Найти настройку"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100/70 dark:border-white/10 dark:bg-white/[0.04] dark:focus:border-brand-400/30 dark:focus:bg-white/[0.06] dark:focus:ring-brand-400/10"
          />
          {query ? (
            <button
              type="button"
              onClick={() => updateQuery('')}
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Очистить поиск"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>

        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" role="tablist" aria-label="Настройки системы">
          {visibleTabs.map((tab, index) => {
            const active = tab.id === activeId
            const Icon = icons[tab.id]
            return (
              <button
                key={tab.id}
                ref={(element) => { tabRefs.current[index] = element }}
                type="button"
                role="tab"
                id={`admin-system-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`admin-system-panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'group flex min-w-[11.5rem] items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition lg:min-w-0',
                  active
                    ? 'border-brand-200 bg-brand-50 text-brand-950 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-white'
                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.04]'
                )}
                onClick={() => activateTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    selectTab((index + 1) % tabs.length)
                  } else if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    selectTab((index - 1 + tabs.length) % tabs.length)
                  } else if (event.key === 'Home') {
                    event.preventDefault()
                    selectTab(0)
                  } else if (event.key === 'End') {
                    event.preventDefault()
                    selectTab(tabs.length - 1)
                  }
                }}
              >
                <span className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition',
                  active ? 'bg-white text-brand-700 shadow-sm dark:bg-white/10 dark:text-brand-200' : 'bg-slate-100/80 text-slate-400 dark:bg-white/[0.05]'
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5">{tab.title}</span>
                  <span className={cn(
                    'mt-0.5 flex min-w-0 max-w-full items-center gap-1.5 text-[11px] font-medium',
                    tab.tone === 'success' && 'text-emerald-700 dark:text-emerald-300',
                    tab.tone === 'warning' && 'text-amber-700 dark:text-amber-300',
                    tab.tone === 'danger' && 'text-red-700 dark:text-red-300',
                    (!tab.tone || tab.tone === 'default') && 'text-slate-400 dark:text-slate-500'
                  )}>
                    <span className={cn(
                      'h-1.5 w-1.5 rounded-full bg-slate-400',
                      tab.tone === 'success' && 'bg-emerald-500',
                      tab.tone === 'warning' && 'bg-amber-500',
                      tab.tone === 'danger' && 'bg-red-500'
                    )} />
                    <span className="truncate">{tab.badge}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {visibleTabs.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs leading-5 text-slate-500 dark:border-white/10">
            Ничего не найдено. Попробуйте другое слово.
          </div>
        ) : null}
        <p className="mt-3 hidden border-t border-slate-100 px-1 pt-3 text-[11px] leading-4 text-slate-400 dark:border-white/[0.07] lg:block">
          Каждый раздел сохраняется отдельно. Несохранённые поля не пропадут при переключении.
        </p>
      </aside>

      <div className="min-w-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`admin-system-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`admin-system-tab-${tab.id}`}
            hidden={tab.id !== activeId}
            className="min-w-0"
          >
            {tab.children}
          </div>
        ))}
      </div>
    </div>
  )
}
