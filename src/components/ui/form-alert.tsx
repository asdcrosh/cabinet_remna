import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function FormAlert({
  children,
  tone = 'danger',
  className,
}: {
  children: ReactNode
  tone?: 'danger' | 'warning'
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border px-3 py-2 text-sm',
        tone === 'danger'
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
        className,
      )}
    >
      {children}
    </div>
  )
}
