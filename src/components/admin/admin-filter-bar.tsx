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
    <div className="flex flex-col gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900">
      <form className={`grid min-w-0 flex-1 gap-2 ${className}`} action={action}>
        {children}
        {resetVisible && resetHref ? <Link href={resetHref} className="btn-secondary">Сбросить</Link> : null}
      </form>
      {count ? (
        <div className="self-end text-sm text-slate-500 dark:text-slate-400">
          {count.shown} из {count.total}
        </div>
      ) : null}
    </div>
  )
}
