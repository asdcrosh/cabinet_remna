import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  className?: string
}

export function StatCard({ label, value, hint, icon, className }: StatCardProps) {
  return (
    <div className={cn('card relative border-t-2 border-t-slate-900 dark:border-t-cyan-300', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{label}</p>
          <div className="mt-3 stat">{value}</div>
          {hint && <p className="stat-label mt-1">{hint}</p>}
        </div>
        {icon && (
          <div className="shrink-0 pt-0.5 text-slate-400 dark:text-slate-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
