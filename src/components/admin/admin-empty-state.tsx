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
          ? 'rounded-xl border border-dashed border-slate-300/80 bg-white px-4 py-8 text-left dark:border-white/[0.1] dark:bg-white/[0.025] sm:px-6'
          : 'rounded-xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-8 text-left dark:border-white/15 dark:bg-white/[0.025]',
        className
      )}
    >
      <div className="mb-4 grid h-10 w-10 place-items-center border border-slate-400 text-slate-500 dark:border-white/25 dark:text-slate-300">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
      {description ? <p className="mt-1.5 max-w-xl text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  )
}
