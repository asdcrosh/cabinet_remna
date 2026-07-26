import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="border-b border-slate-300/80 pb-3 dark:border-white/10 sm:pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] text-slate-950 dark:text-white sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {action && <div className="shrink-0 sm:text-right">{action}</div>}
      </div>
    </header>
  )
}
