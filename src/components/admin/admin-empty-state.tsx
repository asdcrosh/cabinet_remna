import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/cn'

type AdminEmptyStateProps = {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  surface?: 'card' | 'plain'
  className?: string
}

export function AdminEmptyState({
  title,
  description,
  icon,
  action,
  surface = 'card',
  className,
}: AdminEmptyStateProps) {
  return (
    <div
      className={cn(
        surface === 'card'
          ? 'card py-12 text-center'
          : 'rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center dark:border-white/10 dark:bg-white/[0.03]',
        className
      )}
    >
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-slate-50 text-slate-500 dark:bg-white/5 dark:text-slate-300">
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}
