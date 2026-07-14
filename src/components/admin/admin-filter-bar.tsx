import type { ReactNode } from 'react'
import Link from 'next/link'

type AdminFilterBarProps = {
  action: string
  children: ReactNode
  resetHref?: string
  resetVisible?: boolean
  count?: {
    shown: number
    total: number
  }
  className?: string
}

export function AdminFilterBar({
  action,
  children,
  resetHref,
  resetVisible = false,
  count,
  className = 'md:grid-cols-[minmax(14rem,1fr)_12rem_12rem_auto_auto]',
}: AdminFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-950/[0.04] dark:border-white/10 dark:bg-surface-900/90 dark:shadow-black/20 sm:p-4">
      <form className={`grid min-w-0 flex-1 gap-2 ${className}`} action={action}>
        {children}
        {resetVisible && resetHref ? <Link href={resetHref} className="btn-secondary">Сбросить</Link> : null}
      </form>
      {count ? (
        <div className="self-end rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
          {count.shown} из {count.total}
        </div>
      ) : null}
    </div>
  )
}
