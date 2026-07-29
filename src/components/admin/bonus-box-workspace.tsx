'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { handleTabListKeyDown } from '@/lib/tab-keyboard'

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
}: {
  active: boolean
  id: string
  controls: string
  onClick: () => void
  children: ReactNode
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
