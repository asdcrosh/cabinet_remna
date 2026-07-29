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
  reference?: string
}

export function SystemState({
  title,
  description,
  action,
  className,
  eyebrow,
  icon,
  tone = 'neutral',
  reference,
}: SystemStateProps) {
  const danger = tone === 'danger'

  return (
    <section
      className={cn(
        'relative w-full max-w-lg overflow-hidden border-y border-slate-200/90 px-4 py-8 text-center dark:border-white/[0.09] sm:px-6 sm:py-10',
        className,
      )}
      role={danger ? 'alert' : 'status'}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-y-6 left-0 w-0.5',
          danger ? 'bg-red-400' : 'bg-cyan-400',
        )}
      />
      <div
        className={cn(
          'mx-auto mb-4 grid h-10 w-10 place-items-center',
          danger
            ? 'text-red-600 dark:text-red-300'
            : 'text-cyan-700 dark:text-cyan-200',
        )}
      >
        {icon ?? (danger ? <AlertTriangle className="h-6 w-6" /> : <Info className="h-6 w-6" />)}
      </div>
      {eyebrow && (
        <div className={cn('mb-2 text-xs font-semibold uppercase tracking-[0.14em]', danger ? 'text-red-600 dark:text-red-300' : 'text-brand-600 dark:text-brand-400')}>
          {eyebrow}
        </div>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl dark:text-white">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      {reference ? (
        <p className="mt-3 font-mono text-[11px] text-slate-400">
          Код ошибки: {reference}
        </p>
      ) : null}
      {action && <div className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">{action}</div>}
    </section>
  )
}
