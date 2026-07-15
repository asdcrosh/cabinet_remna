'use client'

import { type ReactNode, useRef, useState } from 'react'
import { CreditCard, Database, LockKeyhole, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'

type SettingsTabId = 'account' | 'sync' | 'security' | 'payments'

type SettingsTabSection = {
  id: SettingsTabId
  title: string
  shortTitle?: string
  description: string
  children: ReactNode
}

const tabIcons: Record<SettingsTabId, ReactNode> = {
  account: <UserRound className="h-4 w-4" />,
  sync: <Database className="h-4 w-4" />,
  security: <LockKeyhole className="h-4 w-4" />,
  payments: <CreditCard className="h-4 w-4" />,
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
    <div className="space-y-4 sm:space-y-5">
      <div className="sticky top-14 z-20 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur dark:bg-surface-950/95 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="rounded-2xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.035]">
          <div role="tablist" aria-label="Разделы настроек" className="grid grid-cols-4 gap-1 sm:grid-cols-2 xl:grid-cols-4">
          {sections.map((section, index) => {
            const active = section.id === activeId

            return (
              <button
                key={section.id}
                ref={(element) => { tabRefs.current[index] = element }}
                type="button"
                role="tab"
                id={`settings-tab-${section.id}`}
                aria-selected={active}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium transition sm:flex-row sm:justify-start sm:gap-3 sm:px-3 sm:py-0 sm:text-left sm:text-sm',
                  active
                    ? 'bg-slate-100 text-slate-950 dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
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
                  className={cn('grid h-7 w-7 shrink-0 place-items-center sm:h-9 sm:w-9', active ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-400')}
                >
                  {tabIcons[section.id]}
                </span>
                <span className="min-w-0 max-w-full">
                  <span className="block max-w-full truncate leading-tight sm:hidden">{section.shortTitle ?? section.title}</span>
                  <span className="hidden whitespace-nowrap leading-tight sm:block">{section.title}</span>
                  <span
                    className={cn(
                      'mt-0.5 hidden truncate text-xs sm:block',
                      active ? 'text-cyan-700/75 dark:text-cyan-100/70' : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
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
        id={activeSection ? `settings-panel-${activeSection.id}` : undefined}
        role="tabpanel"
        aria-labelledby={activeSection ? `settings-tab-${activeSection.id}` : undefined}
      >
        {activeSection?.children}
      </div>
    </div>
  )
}
