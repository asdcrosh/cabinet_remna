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
    <div className={cn('card py-12 text-center', className)}>
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">
        {icon ?? <Info className="h-7 w-7" />}
      </div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
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

  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-sm', styles[tone])}>
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">{title}</div>
          {description && <div className="mt-1 opacity-80">{description}</div>}
        </div>
      </div>
    </div>
  )
}
