'use client'

import { type ReactNode, useState } from 'react'
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

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="sticky top-14 z-20 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur dark:bg-surface-950/95 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="snap-x overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm shadow-slate-950/[0.04] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-white/[0.045] dark:shadow-black/20">
          <div role="tablist" aria-label="Разделы настроек" className="flex min-w-max gap-1 sm:grid sm:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
          {sections.map((section) => {
            const active = section.id === activeId

            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                id={`settings-tab-${section.id}`}
                aria-selected={active}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'flex h-10 shrink-0 snap-start items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-medium transition sm:h-14 sm:justify-start sm:gap-3 sm:px-3 sm:text-left',
                  active
                    ? 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200 dark:bg-cyan-400/15 dark:text-cyan-100 dark:ring-cyan-300/20'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                )}
                onClick={() => setActiveId(section.id)}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl',
                    active
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-300/15 dark:text-cyan-100'
                      : 'bg-slate-100 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-200'
                  )}
                >
                  {tabIcons[section.id]}
                </span>
                <span className="min-w-0">
                  <span className="block whitespace-nowrap leading-tight sm:hidden">{section.shortTitle ?? section.title}</span>
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
