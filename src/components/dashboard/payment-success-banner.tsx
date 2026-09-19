'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CheckCircle2, Circle, CreditCard, KeyRound, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { apiFetch } from '@/lib/api-client'
import type { PaymentBannerStatus } from '@/lib/payment-status-presentation'

const PAYMENT_STATUS_POLL_SECONDS = 60
const PAYMENT_STATUS_POLL_DELAYS_MS = [3000, 5000, 8000, 12000, 15000] as const

export function PaymentSuccessBanner({
  status = 'processing',
  supportEnabled = true,
  paymentId,
}: {
  status?: PaymentBannerStatus
  supportEnabled?: boolean
  paymentId: string
}) {
  const router = useRouter()
  const [liveStatus, setLiveStatus] = useState(status)
  const [seconds, setSeconds] = useState(PAYMENT_STATUS_POLL_SECONDS)
  const [checkingNow, setCheckingNow] = useState(false)

  useEffect(() => {
    if (status !== 'processing' && status !== 'awaiting') return
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: number | null = null
    let stopped = false
    let attempt = 0
    setLiveStatus(status)
    setSeconds(PAYMENT_STATUS_POLL_SECONDS)

    async function refresh() {
      if (stopped) return
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, PAYMENT_STATUS_POLL_SECONDS - elapsedSeconds)
      setSeconds(remaining)
      if (remaining === 0) return
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(refresh, PAYMENT_STATUS_POLL_DELAYS_MS[0])
        return
      }
      try {
        const reconcile = attempt === 0
        const result = await apiFetch<{ status: PaymentBannerStatus }>(
          reconcile ? '/api/payment/status' : `/api/payment/status?paymentId=${encodeURIComponent(paymentId)}`,
          {
            method: reconcile ? 'POST' : 'GET',
            ...(reconcile ? { body: JSON.stringify({ paymentId }) } : {}),
            signal: controller.signal,
            silent: true,
          }
        )
        attempt += 1
        if (stopped) return
        setLiveStatus(result.status)
        if (result.status === 'ready') {
          router.refresh()
          return
        }
        if (!['processing', 'awaiting', 'verification_error'].includes(result.status)) return
      } catch {
        attempt += 1
        if (stopped) return
      }
      const delay = PAYMENT_STATUS_POLL_DELAYS_MS[Math.min(attempt, PAYMENT_STATUS_POLL_DELAYS_MS.length - 1)]
      timer = window.setTimeout(refresh, delay)
    }

    timer = window.setTimeout(refresh, PAYMENT_STATUS_POLL_DELAYS_MS[0])

    return () => {
      stopped = true
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [paymentId, router, status])

  async function checkNow() {
    if (checkingNow) return
    setCheckingNow(true)
    try {
      const result = await apiFetch<{ status: PaymentBannerStatus }>('/api/payment/status', {
        method: 'POST',
        body: JSON.stringify({ paymentId }),
      })
      setLiveStatus(result.status)
      if (result.status === 'ready') router.refresh()
    } finally {
      setCheckingNow(false)
    }
  }

  const copy = getBannerCopy(liveStatus, seconds)

  return (
    <section
      className={cn('relative overflow-hidden rounded-3xl border p-4 sm:p-5', copy.shell)}
      role={liveStatus === 'verification_error' || liveStatus === 'provisioning_error' || liveStatus === 'reversal_error' || liveStatus === 'canceled' || liveStatus === 'not_found' ? 'alert' : 'status'}
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
          {(liveStatus === 'verification_error' || liveStatus === 'provisioning_error' || liveStatus === 'reversal_error') && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => void checkNow()} disabled={checkingNow} className="btn-primary min-h-11 px-4">
                {checkingNow ? 'Проверяем...' : 'Проверить сейчас'}
              </button>
              {supportEnabled && (
                <Link
                  href={`/dashboard/support?category=payment&payment=${encodeURIComponent(paymentId)}`}
                  className="btn-secondary min-h-11 px-4"
                >
                  Написать в поддержку
                </Link>
              )}
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
          {seconds === 0 && (liveStatus === 'processing' || liveStatus === 'awaiting') && (
            <div className="mt-4">
              <button type="button" onClick={() => void checkNow()} disabled={checkingNow} className="btn-secondary min-h-11 px-4">
                {checkingNow ? 'Проверяем...' : 'Проверить сейчас'}
              </button>
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

function PaymentProgress({ status }: { status: PaymentBannerStatus }) {
  const canceled = status === 'canceled'
  if (status === 'reversal_error') return null
  const paymentConfirmed = ['processing', 'provisioning_error', 'ready'].includes(status)
  const steps = [
    { label: 'Оплата получена', done: paymentConfirmed, active: status === 'awaiting' || status === 'verification_error', failed: canceled },
    { label: 'Настраиваем подписку', done: status === 'ready', active: status === 'processing' || status === 'provisioning_error' },
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

function getBannerCopy(status: PaymentBannerStatus, seconds: number) {
  if (status === 'awaiting') {
    return {
      title: 'Проверяем оплату',
      description: seconds > 0
        ? 'Ждём подтверждение платёжной системы. Статус обновляется автоматически.'
        : 'Автоматическая проверка завершена. Оплата может подтвердиться позже; при необходимости проверьте статус вручную.',
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

  if (status === 'verification_error') {
    return {
      title: 'Не удалось проверить оплату',
      description: 'Платёжная система временно не ответила. Это не означает отмену или успешное списание. Обновите статус чуть позже.',
      icon: <AlertTriangle className="h-5 w-5" />,
      shell: 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
      iconShell: 'bg-amber-100 text-amber-700 dark:bg-amber-300/10 dark:text-amber-100',
    }
  }

  if (status === 'provisioning_error') {
    return {
      title: 'Оплата сохранена',
      description: 'Платёж подтверждён, но доступ пока не выдан. Автоматическая выдача продолжится; при необходимости обратитесь в поддержку.',
      icon: <AlertTriangle className="h-5 w-5" />,
      shell: 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
      iconShell: 'bg-amber-100 text-amber-700 dark:bg-amber-300/10 dark:text-amber-100',
    }
  }

  if (status === 'reversal_error') {
    return {
      title: 'Возврат требует проверки',
      description: 'Платёжная система подтвердила возврат, но отключение оплаченного доступа завершилось не полностью. Обратитесь в поддержку.',
      icon: <AlertTriangle className="h-5 w-5" />,
      shell: 'border-red-200 bg-red-50/80 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
      iconShell: 'bg-red-100 text-red-700 dark:bg-red-300/10 dark:text-red-100',
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
    title: 'Проверяем результат оплаты',
    description: seconds > 0
      ? `Статус обновляется автоматически ещё ${seconds} сек.`
      : 'Автоматическая проверка завершена. Обновите статус вручную.',
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    shell: 'border-cyan-200 bg-cyan-50/80 text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100',
    iconShell: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-100',
  }
}
