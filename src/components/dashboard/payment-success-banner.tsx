'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

type PaymentSuccessBannerStatus = 'ready' | 'processing' | 'attention'

export function PaymentSuccessBanner({ status = 'processing' }: { status?: PaymentSuccessBannerStatus }) {
  const router = useRouter()
  const [seconds, setSeconds] = useState(12)

  useEffect(() => {
    if (status !== 'processing') return

    const refresh = window.setInterval(() => {
      router.refresh()
      setSeconds((value) => Math.max(0, value - 3))
    }, 3000)

    return () => window.clearInterval(refresh)
  }, [router, status])

  const copy = getBannerCopy(status, seconds)

  return (
    <div className={copy.className}>
      {status === 'ready' && <PaymentConfetti />}
      {copy.icon}
      <div>
        <div className="font-medium">{copy.title}</div>
        <div className="mt-1 opacity-80">{copy.description}</div>
        {status === 'ready' && (
          <a href="/dashboard/subscription" className="mt-3 inline-flex text-sm font-semibold underline underline-offset-4">
            Открыть подписку
          </a>
        )}
      </div>
    </div>
  )
}

function PaymentConfetti() {
  return (
    <div className="payment-confetti" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, index) => {
        const style = {
          '--confetti-index': index,
          '--confetti-hue': 155 + index * 14,
        } as CSSProperties
        return <span key={index} style={style} />
      })}
    </div>
  )
}

function getBannerCopy(status: PaymentSuccessBannerStatus, seconds: number) {
  if (status === 'ready') {
    return {
      title: 'Доступ готов',
      description: 'Оплата прошла, подписка уже доступна в кабинете.',
      icon: <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />,
      className:
        'payment-success-pop relative overflow-hidden flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
    }
  }

  if (status === 'attention') {
    return {
      title: 'Оплата сохранена',
      description: 'Доступ пока не выдан. Обновите страницу чуть позже или проверьте платежи в кабинете.',
      icon: <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />,
      className:
        'flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    }
  }

  return {
    title: 'Оплата принята',
    description: `Готовим доступ. Страница обновится ещё несколько раз${seconds > 0 ? `, примерно ${seconds} сек.` : '.'}`,
    icon: <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />,
    className:
      'flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
  }
}
