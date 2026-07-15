import type { ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SystemStateProps {
  title: string
  description: string
  action?: ReactNode
  className?: string
  eyebrow?: string
  icon?: ReactNode
  tone?: 'danger' | 'neutral'
}

export function SystemState({
  title,
  description,
  action,
  className,
  eyebrow,
  icon,
  tone = 'neutral',
}: SystemStateProps) {
  const danger = tone === 'danger'

  return (
    <section
      className={cn(
        'panel relative w-full max-w-lg overflow-hidden px-5 py-9 text-center sm:px-8 sm:py-11',
        className,
      )}
      role={danger ? 'alert' : 'status'}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
          danger ? 'via-red-400/80' : 'via-cyan-300/80',
        )}
      />
      <div
        className={cn(
          'mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border shadow-sm',
          danger
            ? 'border-red-100 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
            : 'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200',
        )}
      >
        {icon ?? (danger ? <AlertTriangle className="h-7 w-7" /> : <Info className="h-7 w-7" />)}
      </div>
      {eyebrow && (
        <div className={cn('mb-2 text-xs font-semibold uppercase tracking-[0.14em]', danger ? 'text-red-600 dark:text-red-300' : 'text-brand-600 dark:text-brand-400')}>
          {eyebrow}
        </div>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl dark:text-white">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      {action && <div className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">{action}</div>}
    </section>
  )
}
