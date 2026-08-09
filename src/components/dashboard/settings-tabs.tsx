'use client'

import { type ReactNode, useRef, useState } from 'react'
import { Link2, LockKeyhole, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'

type SettingsTabId = 'account' | 'sync' | 'security'

type SettingsTabSection = {
  id: SettingsTabId
  title: string
  shortTitle?: string
  children: ReactNode
}

const tabIcons: Record<SettingsTabId, ReactNode> = {
  account: <UserRound className="h-4 w-4" />,
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
    <div className="settings-workspace grid gap-4 md:grid-cols-[9.5rem_minmax(0,1fr)] md:gap-5">
      <div className="sticky top-14 z-20 -mx-4 bg-surface-50/95 px-4 py-2 backdrop-blur dark:bg-surface-950/95 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none md:self-start">
        <div className="settings-workspace-tabs border-y border-slate-200 py-1 dark:border-white/10 md:sticky md:top-6 md:border-y-0 md:border-l md:py-0 md:pl-2">
          <div role="tablist" aria-label="Разделы настроек" className="grid grid-cols-3 gap-1 md:grid-cols-1">
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
                  'flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-1.5 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-sm md:justify-start',
                  active
                    ? 'bg-brand-800 text-white dark:bg-brand-300 dark:text-brand-900'
                    : 'text-slate-500 hover:bg-slate-950/[0.04] hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
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
                  className={cn('grid h-6 w-6 shrink-0 place-items-center', active ? 'text-cyan-200 dark:text-brand-900' : 'text-slate-400')}
                >
                  {tabIcons[section.id]}
                </span>
                <span className="min-w-0 max-w-full">
                  <span className="block max-w-full truncate leading-tight sm:hidden">{section.shortTitle ?? section.title}</span>
                  <span className="hidden truncate leading-tight sm:block">{section.title}</span>
                </span>
              </button>
            )
          })}
          </div>
        </div>
      </div>

      <div
        className="min-w-0"
        id={activeSection ? `settings-panel-${activeSection.id}` : undefined}
        role="tabpanel"
        aria-labelledby={activeSection ? `settings-tab-${activeSection.id}` : undefined}
      >
        {activeSection?.children}
      </div>
    </div>
  )
}
