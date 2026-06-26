'use client'

import Link from 'next/link'
import { cn } from '@/lib/cn'

interface GoogleAuthButtonProps {
  next?: string
  referralCode?: string
  label?: string
  className?: string
}

export function GoogleAuthButton({
  next = '/dashboard',
  referralCode = '',
  label = 'Продолжить через Google',
  className,
}: GoogleAuthButtonProps) {
  const params = new URLSearchParams({ next })
  if (referralCode) params.set('ref', referralCode)

  return (
    <Link
      href={`/api/auth/google/start?${params.toString()}`}
      className={cn(
        'flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-950 dark:text-white dark:hover:bg-surface-900',
        className
      )}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-base font-bold text-slate-900 shadow-sm ring-1 ring-slate-200">
        G
      </span>
      {label}
    </Link>
  )
}
