'use client'

import { type ReactNode, useRef, useState } from 'react'
import { Bell, Link2, LockKeyhole, RefreshCw, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'

type SettingsTabId = 'account' | 'auto-renewal' | 'notifications' | 'sync' | 'security'

type SettingsTabSection = {
  id: SettingsTabId
  title: string
  shortTitle?: string
  description: string
  children: ReactNode
}

const tabIcons: Record<SettingsTabId, ReactNode> = {
  account: <UserRound className="h-4 w-4" />,
  'auto-renewal': <RefreshCw className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  sync: <Link2 className="h-4 w-4" />,
  security: <LockKeyhole className="h-4 w-4" />,
}

export function SettingsTabs({ sections }: { sections: SettingsTabSection[] }) {
  const [activeId, setActiveId] = useState<SettingsTabId>(sections[0]?.id ?? 'account')
  const activeSection = sections.find((section) => section.id === activeId) ?? sections[0]
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectTab(index: number) {
    const section = sections[index]
    if (!section) return
    setActiveId(section.id)
    window.requestAnimationFrame(() => tabRefs.current[index]?.focus())
  }

  return (
    <div className="settings-workspace grid gap-4 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-5">
      <div className="min-w-0 lg:self-start">
        <div className="settings-workspace-tabs lg:sticky lg:top-6">
          <p className="mb-2 hidden px-1 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 lg:block">
            Разделы
          </p>
          <div role="tablist" aria-label="Разделы настроек" className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {sections.map((section, index) => {
            const active = section.id === activeId

            return (
              <button
                key={section.id}
                ref={(element) => { tabRefs.current[index] = element }}
                type="button"
                role="tab"
                id={`settings-tab-${section.id}`}
                aria-label={section.title}
                aria-selected={active}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'group flex min-h-[4.5rem] min-w-0 items-start gap-2.5 rounded-xl border px-3 py-3 text-left transition lg:min-h-0',
                  active
                    ? 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-white/[0.05]'
                )}
                onClick={() => setActiveId(section.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    selectTab((index + 1) % sections.length)
                  } else if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    selectTab((index - 1 + sections.length) % sections.length)
                  } else if (event.key === 'Home') {
                    event.preventDefault()
                    selectTab(0)
                  } else if (event.key === 'End') {
                    event.preventDefault()
                    selectTab(sections.length - 1)
                  }
                }}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors',
                    active
                      ? 'bg-white text-brand-700 shadow-sm dark:bg-white/10 dark:text-brand-200'
                      : 'bg-slate-100 text-slate-400 group-hover:text-slate-600 dark:bg-white/[0.06] dark:text-slate-500 dark:group-hover:text-slate-300'
                  )}
                >
                  {tabIcons[section.id]}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="block text-sm font-semibold leading-5">{section.shortTitle ?? section.title}</span>
                  <span className="mt-0.5 hidden text-xs leading-4 text-slate-500 dark:text-slate-400 sm:block lg:block">
                    {section.description}
                  </span>
                </span>
              </button>
            )
          })}
          </div>
        </div>
      </div>

      <div
        className="min-w-0 lg:pt-6"
        id={activeSection ? `settings-panel-${activeSection.id}` : undefined}
        role="tabpanel"
        aria-labelledby={activeSection ? `settings-tab-${activeSection.id}` : undefined}
      >
        {activeSection?.children}
      </div>
    </div>
  )
}
