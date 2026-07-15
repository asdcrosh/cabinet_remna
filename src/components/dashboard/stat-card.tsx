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
    <div className={cn('card', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="stat-label">{label}</p>
          <div className="mt-2 stat">{value}</div>
          {hint && <p className="stat-label mt-1">{hint}</p>}
        </div>
        {icon && (
          <div className="rounded-xl bg-slate-100 p-3 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
