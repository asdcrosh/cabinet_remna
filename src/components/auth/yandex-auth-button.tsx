'use client'

import Link from 'next/link'
import { cn } from '@/lib/cn'

interface YandexAuthButtonProps {
  next?: string
  referralCode?: string
  label?: string
  className?: string
}

export function YandexAuthButton({
  next = '/dashboard',
  referralCode = '',
  label = 'Продолжить через Яндекс',
  className,
}: YandexAuthButtonProps) {
  const params = new URLSearchParams({ next })
  if (referralCode) params.set('ref', referralCode)

  return (
    <Link
      href={`/api/auth/yandex/start?${params.toString()}`}
      className={cn(
        'flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-950 dark:text-white dark:hover:bg-surface-900',
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
