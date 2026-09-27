'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bell, BookOpen, LockKeyhole, Send, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'

export type SettingsTabId = 'account' | 'security' | 'telegram' | 'notifications' | 'data'

type SettingsTabSection = {
  id: SettingsTabId
  title: string
  description: string
  children: ReactNode
}

const tabIcons: Record<SettingsTabId, ReactNode> = {
  account: <UserRound className="h-[18px] w-[18px]" />,
  security: <LockKeyhole className="h-[18px] w-[18px]" />,
  telegram: <Send className="h-[18px] w-[18px]" />,
  notifications: <Bell className="h-[18px] w-[18px]" />,
  data: <BookOpen className="h-[18px] w-[18px]" />,
}

export function SettingsTabs({
  sections,
  initialId = 'account',
  footer,
}: {
  sections: SettingsTabSection[]
  initialId?: SettingsTabId
  footer?: ReactNode
}) {
  const [activeId, setActiveId] = useState<SettingsTabId>(initialId)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    setActiveId(initialId)
    const activeTab = tabRefs.current.find((tab) => tab?.id === `settings-tab-${initialId}`)
    if (activeTab && window.innerWidth < 1024) {
      const list = activeTab.parentElement
      if (list) list.scrollLeft = activeTab.offsetLeft - (list.clientWidth - activeTab.clientWidth) / 2
    }
  }, [initialId])

  function activateTab(id: SettingsTabId) {
    if (id === activeId) return
    setActiveId(id)
    const params = new URLSearchParams(searchParams.toString())
    params.set('section', id)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function selectTab(index: number) {
    const section = sections[index]
    if (!section) return
    activateTab(section.id)
    window.requestAnimationFrame(() => tabRefs.current[index]?.focus())
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[13.75rem_minmax(0,1fr)] lg:gap-7">
      <aside className="min-w-0 lg:self-start lg:sticky lg:top-6">
        <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 lg:block">Разделы</p>
        <div role="tablist" aria-label="Разделы настроек" className="flex min-w-0 gap-1 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
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
                title={section.description}
                aria-selected={active}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'group flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors lg:min-h-12 lg:w-full lg:border-transparent lg:px-3.5',
                  active
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.025] dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white lg:bg-transparent lg:dark:bg-transparent'
                )}
                onClick={() => activateTab(section.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    selectTab((index + 1) % sections.length)
                  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
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
                <span className={cn('shrink-0', active ? 'text-cyan-300 dark:text-cyan-700' : 'text-slate-400 dark:text-slate-500')}>{tabIcons[section.id]}</span>
                <span className="whitespace-nowrap">{section.title}</span>
              </button>
            )
          })}
        </div>
        {footer ? <div className="mt-5 hidden border-t border-slate-200 pt-5 dark:border-white/10 lg:block">{footer}</div> : null}
      </aside>

      <div className="min-w-0">
        {sections.map((section) => (
          <div
            key={section.id}
            id={`settings-panel-${section.id}`}
            role="tabpanel"
            aria-labelledby={`settings-tab-${section.id}`}
            hidden={section.id !== activeId}
          >
            {section.children}
          </div>
        ))}
      </div>
    </div>
  )
}
