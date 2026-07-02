import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="relative overflow-hidden rounded-lg border border-white/70 bg-white/72 p-4 shadow-sm shadow-slate-200/50 backdrop-blur dark:border-white/10 dark:bg-surface-950/45 dark:shadow-black/20 sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400/80 via-emerald-300/70 to-transparent" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {action && <div className="shrink-0 sm:text-right">{action}</div>}
      </div>
    </header>
  )
}
