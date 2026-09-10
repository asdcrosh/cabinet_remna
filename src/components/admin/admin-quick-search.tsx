'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import {
  CreditCard,
  Gift,
  LifeBuoy,
  Search,
  Send,
  UserRoundSearch,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/cn'

type SearchTarget = 'users' | 'payments'

const quickActions = [
  { href: '/dashboard/admin/support', label: 'Ответить пользователям', icon: LifeBuoy },
  { href: '/dashboard/admin/recovery', label: 'Исправить выдачу', icon: Wrench },
  { href: '/dashboard/admin/broadcasts', label: 'Создать рассылку', icon: Send },
  { href: '/dashboard/admin/bonus-box', label: 'Настроить подарки', icon: Gift },
]

export function AdminQuickSearch() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<SearchTarget>('users')

  function submitSearch() {
    const value = query.trim()
    if (!value) {
      inputRef.current?.focus()
      return
    }
    const path = target === 'users' ? '/dashboard/admin/users' : '/dashboard/admin/payments'
    router.push(`${path}?q=${encodeURIComponent(value)}`)
  }

  return (
    <section className="grid overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.4)] dark:border-white/[0.09] dark:bg-white/[0.035] lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,.85fr)]">
      <form
        role="search"
        aria-label="Быстрый поиск в админке"
        className="min-w-0 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault()
          submitSearch()
        }}
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Найти и проверить</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Введите email, имя или идентификатор</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block min-w-0">
            <span className="sr-only">Пользователь или платёж</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input pl-9"
              placeholder={target === 'users' ? 'Email, имя или ID пользователя' : 'Email, тариф или ID платежа'}
            />
          </label>
          <button type="submit" className="btn-primary w-full sm:w-auto">
            {target === 'users' ? <UserRoundSearch className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
            Найти
          </button>
        </div>
        <div className="mt-3 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-black/20" role="radiogroup" aria-label="Где искать">
          <TargetButton active={target === 'users'} onClick={() => setTarget('users')}>Пользователи</TargetButton>
          <TargetButton active={target === 'payments'} onClick={() => setTarget('payments')}>Платежи</TargetButton>
        </div>
      </form>

      <div className="border-t border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-black/10 sm:p-5 lg:border-l lg:border-t-0">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Частые операции</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-slate-300 dark:hover:border-brand-300/30 dark:hover:text-white"
              >
                <Icon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
                <span className="min-w-0 leading-5">{action.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function TargetButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn(
        'min-h-8 rounded-lg px-3 text-xs font-semibold transition-colors',
        active
          ? 'bg-white text-slate-950 shadow-sm dark:bg-white/10 dark:text-white'
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
