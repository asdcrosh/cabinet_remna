'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

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
      <div className="mb-5 flex gap-1 border-b border-slate-200 dark:border-white/10" role="tablist" aria-label="Разделы управления бонусами">
        <WorkspaceTabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Обзор и задания
        </WorkspaceTabButton>
        <WorkspaceTabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>
          Призы и история
        </WorkspaceTabButton>
      </div>
      <div role="tabpanel">
        {tab === 'overview' ? overview : catalog}
      </div>
    </div>
  )
}

function WorkspaceTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
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
