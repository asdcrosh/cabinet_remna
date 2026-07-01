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
    <div className={cn('card relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200/80 dark:hover:border-cyan-500/30', className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400 via-emerald-400 to-transparent opacity-90" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="stat-label">{label}</p>
          <div className="mt-2 stat">{value}</div>
          {hint && <p className="stat-label mt-1">{hint}</p>}
        </div>
        {icon && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/90 p-3 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-cyan-200">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
