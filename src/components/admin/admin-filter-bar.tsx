'use client'

import type { ReactNode } from 'react'
import { useId, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'

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
  const [mobileOpen, setMobileOpen] = useState(resetVisible)
  const filtersId = useId()

  return (
    <section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-2.5 dark:border-white/[0.08] dark:bg-white/[0.025] sm:p-3">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl bg-slate-50 px-3 text-left text-sm font-semibold text-slate-800 dark:bg-white/[0.045] dark:text-slate-100 md:hidden"
        aria-expanded={mobileOpen}
        aria-controls={filtersId}
        onClick={() => setMobileOpen((value) => !value)}
      >
        <SlidersHorizontal className="h-4 w-4 text-cyan-600" />
        <span className="flex-1">Поиск и фильтры</span>
        {resetVisible ? <span className="h-2 w-2 rounded-full bg-cyan-500" aria-label="Фильтры применены" /> : null}
        {count ? (
          <span className="rounded-lg bg-white px-2 py-1 text-xs tabular-nums text-slate-500 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10">
            {count.shown}/{count.total}
          </span>
        ) : null}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className="hidden items-center justify-between gap-3 px-1 pb-2.5 md:flex">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Фильтры списка
        </div>
        {count ? (
          <div className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            Показано {count.shown} из {count.total}
          </div>
        ) : null}
      </div>
      <form
        id={filtersId}
        aria-label="Фильтры списка"
        className={cn(
          mobileOpen ? 'grid' : 'hidden',
          'mt-2 min-w-0 flex-1 gap-2 border-t border-slate-200/80 pt-3 dark:border-white/[0.08] md:mt-0 md:grid md:border-0 md:pt-0',
          className
        )}
        action={action}
      >
        {children}
        {resetVisible && resetHref ? <Link href={resetHref} className="btn-secondary w-full self-end">Сбросить</Link> : null}
      </form>
    </section>
  )
}

export function AdminFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold leading-tight text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}
