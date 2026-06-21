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
    <div className={cn('card relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5', className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-brand-500 opacity-80" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="stat-label">{label}</p>
          <div className="mt-2 stat">{value}</div>
          {hint && <p className="stat-label mt-1">{hint}</p>}
        </div>
        {icon && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-surface-800 dark:text-cyan-200">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
