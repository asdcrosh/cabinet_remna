'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { handleTabListKeyDown } from '@/lib/tab-keyboard'
import {
  BONUS_ADMIN_TABS,
  buildBonusAdminTabHref,
  type BonusAdminTab,
} from '@/components/admin/bonus-box-workspace-model'

type WorkspaceTab = 'overview' | 'catalog'

export function BonusBoxWorkspace({
  overview,
  catalog,
  initialTab = 'overview',
}: {
  overview: ReactNode
  catalog: ReactNode
  initialTab?: WorkspaceTab
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab)

  return (
    <div>
      <div
        className="mb-5 flex gap-1 border-b border-slate-200 dark:border-white/10"
        role="tablist"
        aria-label="Разделы управления бонусами"
        onKeyDown={handleTabListKeyDown}
      >
        <WorkspaceTabButton
          id="bonus-workspace-tab-overview"
          controls="bonus-workspace-panel-overview"
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
        >
          Обзор и задания
        </WorkspaceTabButton>
        <WorkspaceTabButton
          id="bonus-workspace-tab-catalog"
          controls="bonus-workspace-panel-catalog"
          active={tab === 'catalog'}
          onClick={() => setTab('catalog')}
        >
          Призы и история
        </WorkspaceTabButton>
      </div>
      <div
        id={`bonus-workspace-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`bonus-workspace-tab-${tab}`}
      >
        {tab === 'overview' ? overview : catalog}
      </div>
    </div>
  )
}

function WorkspaceTabButton({
  active,
  id,
  controls,
  onClick,
  children,
  nowrap = false,
}: {
  active: boolean
  id: string
  controls: string
  onClick: () => void
  children: ReactNode
  nowrap?: boolean
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={cn(
        'relative min-h-11 px-3 text-sm font-medium transition-colors',
        nowrap && 'shrink-0 whitespace-nowrap',
        active
          ? 'text-slate-950 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-cyan-500 dark:text-white'
          : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * Новый дизайн: один уровень вкладок — Призы · Задания и события · Экономика · История.
 * Вкладка пишется в ?view=, чтобы обновление страницы и фильтры истории оставались на месте.
 */
export function BonusBoxWorkspaceV2({
  initialTab,
  panels,
}: {
  initialTab: BonusAdminTab
  panels: Record<BonusAdminTab, ReactNode>
}) {
  const [tab, setTab] = useState<BonusAdminTab>(initialTab)

  function selectTab(next: BonusAdminTab) {
    setTab(next)
    window.history.replaceState(null, '', buildBonusAdminTabHref(window.location.pathname, window.location.search, next))
  }

  return (
    <div>
      <div
        className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 dark:border-white/10"
        role="tablist"
        aria-label="Разделы управления бонусами"
        onKeyDown={handleTabListKeyDown}
        data-swipe-navigation="ignore"
      >
        {BONUS_ADMIN_TABS.map((item) => (
          <WorkspaceTabButton
            key={item.id}
            id={`bonus-tab-${item.id}`}
            controls={`bonus-panel-${item.id}`}
            active={tab === item.id}
            onClick={() => selectTab(item.id)}
            nowrap
          >
            {item.label}
          </WorkspaceTabButton>
        ))}
      </div>
      <div id={`bonus-panel-${tab}`} role="tabpanel" aria-labelledby={`bonus-tab-${tab}`}>
        {panels[tab]}
      </div>
    </div>
  )
}
