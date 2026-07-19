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
          ? 'rounded-[1.75rem] border border-slate-200/80 bg-white px-4 py-10 text-center dark:border-white/[0.08] dark:bg-white/[0.025] sm:px-6 sm:py-12'
          : 'rounded-[1.5rem] border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-8 text-center dark:border-white/15 dark:bg-white/[0.025]',
        className
      )}
    >
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 ring-1 ring-slate-200/70 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
      {description ? <p className="mx-auto mt-1.5 max-w-md text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}
