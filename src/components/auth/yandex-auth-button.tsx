'use client'

import Link from 'next/link'
import { cn } from '@/lib/cn'

interface YandexAuthButtonProps {
  next?: string
  referralCode?: string
  label?: string
  className?: string
  legalAccepted?: boolean
  registering?: boolean
}

export function YandexAuthButton({
  next = '/dashboard',
  referralCode = '',
  label = 'Продолжить через Яндекс',
  className,
  legalAccepted = true,
  registering = false,
}: YandexAuthButtonProps) {
  const params = new URLSearchParams({ next })
  if (referralCode) params.set('ref', referralCode)
  if (registering && legalAccepted) params.set('legal', '1')

  if (registering && !legalAccepted) {
    return (
      <button
        type="button"
        disabled
        title="Сначала примите соглашение и дайте согласие на обработку персональных данных"
        className={cn(
          'flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-slate-600',
          className
        )}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#fc3f1d]/50 text-sm font-bold text-white">
          Я
        </span>
        {label}
      </button>
    )
  }

  return (
    <Link
      href={`/api/auth/yandex/start?${params.toString()}`}
      className={cn(
        'flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-white dark:hover:bg-white/[0.05]',
        className
      )}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#fc3f1d] text-sm font-bold text-white shadow-sm">
        Я
      </span>
      {label}
    </Link>
  )
}
