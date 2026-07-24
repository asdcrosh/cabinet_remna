import type { ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('card relative overflow-hidden border-dashed px-4 py-7 sm:flex sm:items-center sm:gap-5 sm:px-6 sm:py-8', className)}>
      <div className="mb-4 grid h-10 w-10 shrink-0 place-items-center border border-cyan-700 text-cyan-700 dark:border-cyan-300 dark:text-cyan-200 sm:mb-0">
        {icon ?? <Info className="h-7 w-7" />}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action && <div className="mt-5 flex w-full shrink-0 flex-col sm:mt-0 sm:w-auto">{action}</div>}
    </div>
  )
}

export function InlineAlert({
  title,
  description,
  tone = 'warning',
}: {
  title: string
  description?: string
  tone?: 'warning' | 'danger' | 'info'
}) {
  const styles = {
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
    info: 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-surface-900 dark:text-slate-200',
  }

  const Icon = tone === 'info' ? Info : AlertTriangle

  return (
    <div
      className={cn('rounded-lg border-l-4 px-4 py-3 text-sm', styles[tone])}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <div className="flex gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">{title}</div>
          {description && <div className="mt-1 opacity-80">{description}</div>}
        </div>
      </div>
    </div>
  )
}
