'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

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

  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
      <button
        type="button"
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium dark:border-white/10 dark:bg-white/[0.035] md:hidden"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((value) => !value)}
      >
        <SlidersHorizontal className="h-4 w-4 text-cyan-600" />
        <span className="flex-1">Поиск и фильтры</span>
        {resetVisible ? <span className="h-2 w-2 rounded-full bg-cyan-500" aria-label="Фильтры применены" /> : null}
        {count ? <span className="text-xs tabular-nums text-slate-500">{count.shown} из {count.total}</span> : null}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
      </button>
      <form
        aria-label="Фильтры списка"
        className={`${mobileOpen ? 'grid' : 'hidden'} min-w-0 flex-1 gap-2 md:grid ${className}`}
        action={action}
      >
        {children}
        {resetVisible && resetHref ? <Link href={resetHref} className="btn-secondary self-end">Сбросить</Link> : null}
      </form>
      {count ? (
        <div className="hidden self-end text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400 md:block">
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
