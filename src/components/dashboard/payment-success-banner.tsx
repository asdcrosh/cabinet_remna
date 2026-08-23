'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CheckCircle2, Circle, CreditCard, KeyRound, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { apiFetch } from '@/lib/api-client'

type PaymentSuccessBannerStatus = 'awaiting' | 'ready' | 'processing' | 'attention' | 'canceled' | 'not_found'
const PAYMENT_STATUS_POLL_SECONDS = 60
const PAYMENT_STATUS_POLL_INTERVAL_MS = 3000

export function PaymentSuccessBanner({
  status = 'processing',
  supportEnabled = true,
  paymentId,
}: {
  status?: PaymentSuccessBannerStatus
  supportEnabled?: boolean
  paymentId: string
}) {
  const router = useRouter()
  const [liveStatus, setLiveStatus] = useState(status)
  const [seconds, setSeconds] = useState(PAYMENT_STATUS_POLL_SECONDS)

  useEffect(() => {
    if (liveStatus !== 'processing' && liveStatus !== 'awaiting') return
    setSeconds(PAYMENT_STATUS_POLL_SECONDS)
    let refreshCount = 0

    const refresh = window.setInterval(async () => {
      if (document.visibilityState === 'hidden') return
      refreshCount += 1
      try {
        const result = await apiFetch<{ status: PaymentSuccessBannerStatus }>('/api/payment/status', {
          method: 'POST',
          body: JSON.stringify({ paymentId }),
        })
        setLiveStatus(result.status)
        if (result.status === 'ready') router.refresh()
      } catch {
        // Следующая автоматическая проверка повторит запрос.
      }
      setSeconds(Math.max(0, PAYMENT_STATUS_POLL_SECONDS - refreshCount * 3))
    }, PAYMENT_STATUS_POLL_INTERVAL_MS)

    return () => window.clearInterval(refresh)
  }, [liveStatus, paymentId, router])

  const copy = getBannerCopy(liveStatus, seconds)

  return (
    <section
      className={cn('relative overflow-hidden rounded-3xl border p-4 sm:p-5', copy.shell)}
      role={liveStatus === 'attention' || liveStatus === 'canceled' || liveStatus === 'not_found' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="flex items-start gap-3.5">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', copy.iconShell)}>
          {copy.icon}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="font-semibold tracking-tight">{copy.title}</div>
          <div className="mt-1 text-sm leading-5 opacity-80">{copy.description}</div>
          {liveStatus !== 'not_found' && <PaymentProgress status={liveStatus} />}
          {liveStatus === 'ready' && (
            <div className="mt-4">
              <Link href="/dashboard/subscription" className="btn-primary min-h-11 w-full px-4 sm:w-auto">
                <KeyRound className="h-4 w-4" />
                Подключить устройство
              </Link>
            </div>
          )}
          {liveStatus === 'attention' && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => router.refresh()} className="btn-primary min-h-11 px-4">Обновить статус</button>
              {supportEnabled && <Link href="/dashboard/support" className="btn-secondary min-h-11 px-4">Написать в поддержку</Link>}
            </div>
          )}
          {liveStatus === 'canceled' && (
            <div className="mt-4">
              <Link href="/dashboard/plans" className="btn-primary min-h-11 w-full px-4 sm:w-auto">
                <CreditCard className="h-4 w-4" />
                Выбрать тариф
              </Link>
            </div>
          )}
          {liveStatus === 'not_found' && (
            <div className="mt-4">
              <Link href="/dashboard/billing" className="btn-secondary min-h-11 w-full px-4 sm:w-auto">
                Открыть историю платежей
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function PaymentProgress({ status }: { status: PaymentSuccessBannerStatus }) {
  const canceled = status === 'canceled'
  const steps = [
    { label: 'Оплата получена', done: status !== 'awaiting' && !canceled, active: status === 'awaiting', failed: canceled },
    { label: 'Настраиваем подписку', done: status === 'ready', active: status === 'processing' || status === 'attention' },
    { label: 'Доступ готов', done: status === 'ready', active: false },
  ]

  return (
    <div className="relative mt-4 grid grid-cols-3 rounded-2xl border border-current/15 bg-white/45 px-2 py-3 dark:bg-black/10">
      <span className="absolute left-[17%] right-[17%] top-[1.35rem] h-px bg-current/20" />
      {steps.map((step) => (
        <div key={step.label} className="relative z-10 flex flex-col items-center gap-1.5 text-center text-xs font-semibold">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white dark:bg-surface-900">
            {step.failed
              ? <X className="h-3.5 w-3.5" />
              : step.done
                ? <Check className="h-3.5 w-3.5" />
                : step.active
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Circle className="h-3.5 w-3.5 opacity-45" />}
          </span>
          <span className={step.done || step.failed ? 'opacity-100' : step.active ? 'opacity-80' : 'opacity-45'}>{step.label}</span>
        </div>
      ))}
    </div>
  )
}

function getBannerCopy(status: PaymentSuccessBannerStatus, seconds: number) {
  if (status === 'awaiting') {
    return {
      title: 'Проверяем оплату',
      description: 'Ждём подтверждение платёжной системы. Статус обновляется автоматически.',
      icon: <Loader2 className="h-5 w-5 animate-spin" />,
      shell: 'border-cyan-200 bg-cyan-50/80 text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100',
      iconShell: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-100',
    }
  }

  if (status === 'ready') {
    return {
      title: 'Доступ готов',
      description: 'Оплата прошла, подписка уже доступна в кабинете.',
      icon: <CheckCircle2 className="h-5 w-5" />,
      shell: 'border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
      iconShell: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-100',
    }
  }

  if (status === 'attention') {
    return {
      title: 'Оплата сохранена',
      description: 'Доступ пока не выдан. Обновите страницу чуть позже или проверьте платежи в кабинете.',
      icon: <AlertTriangle className="h-5 w-5" />,
      shell: 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
      iconShell: 'bg-amber-100 text-amber-700 dark:bg-amber-300/10 dark:text-amber-100',
    }
  }

  if (status === 'canceled') {
    return {
      title: 'Оплата не завершена',
      description: 'Платёж отменён или ссылка на оплату устарела. Новый доступ не оформлен.',
      icon: <X className="h-5 w-5" />,
      shell: 'border-slate-200 bg-white text-slate-950 dark:border-white/10 dark:bg-white/[0.035] dark:text-white',
      iconShell: 'bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300',
    }
  }

  if (status === 'not_found') {
    return {
      title: 'Платёж не найден',
      description: 'Не удалось найти этот платёж в вашем аккаунте. Проверьте историю операций.',
      icon: <AlertTriangle className="h-5 w-5" />,
      shell: 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
      iconShell: 'bg-amber-100 text-amber-700 dark:bg-amber-300/10 dark:text-amber-100',
    }
  }

  return {
    title: 'Оплата принята',
    description: seconds > 0
      ? `Готовим доступ. Статус обновляется автоматически, обычно до ${seconds} сек.`
      : 'Готовим доступ. Статус обновляется автоматически.',
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    shell: 'border-cyan-200 bg-cyan-50/80 text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100',
    iconShell: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-100',
  }
}
