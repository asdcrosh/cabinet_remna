'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CheckCircle2, Circle, CreditCard, KeyRound, Loader2 } from 'lucide-react'

type PaymentSuccessBannerStatus = 'ready' | 'processing' | 'attention'

export function PaymentSuccessBanner({
  status = 'processing',
  supportEnabled = true,
}: {
  status?: PaymentSuccessBannerStatus
  supportEnabled?: boolean
}) {
  const router = useRouter()
  const [seconds, setSeconds] = useState(12)

  useEffect(() => {
    if (status !== 'processing') return
    setSeconds(12)
    let refreshCount = 0

    const refresh = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      refreshCount += 1
      router.refresh()
      setSeconds(Math.max(0, 12 - refreshCount * 3))
      if (refreshCount >= 4) window.clearInterval(refresh)
    }, 3000)

    return () => window.clearInterval(refresh)
  }, [router, status])

  const copy = getBannerCopy(status, seconds)

  return (
    <div className={copy.className}>
      {status === 'ready' && <PaymentConfetti />}
      {copy.icon}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{copy.title}</div>
        <div className="mt-1 opacity-80">{copy.description}</div>
        <PaymentProgress status={status} />
        {status === 'ready' && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard/subscription" className="btn-primary min-h-11 px-4">
              <KeyRound className="h-4 w-4" />
              Подключить устройство
            </Link>
            <Link href="/dashboard/billing" className="btn-secondary min-h-11 px-4">
              <CreditCard className="h-4 w-4" />
              Открыть платёж
            </Link>
          </div>
        )}
        {status === 'attention' && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard/billing" className="btn-primary min-h-11 px-4">Проверить платёж</Link>
            {supportEnabled && <Link href="/dashboard/support" className="btn-secondary min-h-11 px-4">Написать в поддержку</Link>}
          </div>
        )}
      </div>
    </div>
  )
}

function PaymentProgress({ status }: { status: PaymentSuccessBannerStatus }) {
  const steps = [
    { label: 'Оплата', done: true },
    { label: 'Выдача', done: status === 'ready', active: status === 'processing' },
    { label: 'Подключение', done: false, active: status === 'ready' },
  ]

  return (
    <div className="relative mt-4 grid grid-cols-3 rounded-lg border border-current/15 bg-white/45 px-2 py-3 dark:bg-black/10">
      <span className="absolute left-[17%] right-[17%] top-[1.35rem] h-px bg-current/20" />
      {steps.map((step) => (
        <div key={step.label} className="relative z-10 flex flex-col items-center gap-1.5 text-center text-xs font-semibold">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white dark:bg-surface-900">
            {step.done ? <Check className="h-3.5 w-3.5" /> : step.active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Circle className="h-3.5 w-3.5 opacity-45" />}
          </span>
          <span className={step.done ? 'opacity-100' : step.active ? 'opacity-80' : 'opacity-45'}>{step.label}</span>
        </div>
      ))}
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
        'payment-success-pop relative overflow-hidden flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 sm:px-5',
    }
  }

  if (status === 'attention') {
    return {
      title: 'Оплата сохранена',
      description: 'Доступ пока не выдан. Обновите страницу чуть позже или проверьте платежи в кабинете.',
      icon: <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />,
      className:
        'flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:px-5',
    }
  }

  return {
    title: 'Оплата принята',
    description: `Готовим доступ. Страница обновится ещё несколько раз${seconds > 0 ? `, примерно ${seconds} сек.` : '.'}`,
    icon: <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />,
    className:
      'flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 sm:px-5',
  }
}
