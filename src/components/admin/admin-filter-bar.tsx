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
    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
      <form aria-label="Фильтры списка" className={`grid min-w-0 flex-1 gap-2 ${className}`} action={action}>
        {children}
        {resetVisible && resetHref ? <Link href={resetHref} className="btn-secondary self-end">Сбросить</Link> : null}
      </form>
      {count ? (
        <div className="self-end text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
          {count.shown} из {count.total}
        </div>
      ) : null}
    </div>
  )
}

export function AdminFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}
