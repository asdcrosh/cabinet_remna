'use client'

import { type ComponentType, type ReactNode, useRef, useState } from 'react'
import { Activity, CreditCard, Palette, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'

type SystemTabId = 'health' | 'branding' | 'features' | 'payments'

type SystemTab = {
  id: SystemTabId
  title: string
  description: string
  badge: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectTab(index: number) {
    const tab = tabs[index]
    if (!tab) return
    setActiveId(tab.id)
    window.requestAnimationFrame(() => tabRefs.current[index]?.focus())
  }

  return (
    <div className="space-y-4">
      <div className="admin-system-tabs lg:sticky lg:top-4 lg:z-20">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="Настройки системы">
          {tabs.map((tab, index) => {
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
                  'group flex min-h-[4.6rem] min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition',
                  active
                    ? 'border-brand-200 bg-brand-50 text-brand-950 shadow-sm dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-surface-950/90 dark:text-slate-200 dark:hover:border-white/15 dark:hover:bg-surface-900'
                )}
                onClick={() => setActiveId(tab.id)}
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
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                  active ? 'bg-white text-brand-700 shadow-sm dark:bg-white/10 dark:text-brand-200' : 'bg-slate-100 text-slate-400 dark:bg-white/[0.06]'
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5">{tab.title}</span>
                  <span className="mt-0.5 hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">{tab.description}</span>
                  <span className={cn(
                    'mt-1.5 flex min-w-0 max-w-full items-center gap-1.5 text-[11px] font-medium',
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
      </div>

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
  )
}
