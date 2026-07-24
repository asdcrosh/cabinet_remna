import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="border-b border-slate-300/80 pb-4 dark:border-white/10 sm:pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
            <span className="h-px w-6 bg-cyan-600 dark:bg-cyan-300" />
            Раздел кабинета
          </div>
          <h1 className="text-2xl font-semibold leading-tight text-slate-950 dark:text-white sm:text-[1.8rem]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {action && <div className="shrink-0 sm:text-right">{action}</div>}
      </div>
    </header>
  )
}
