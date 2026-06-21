'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { Check, CreditCard, Sparkles, Tag, X } from 'lucide-react'

interface PlanCardProps {
  id: string
  name: string
  description: string | null
  price: string
  durationDays: number
  trafficLimitGb: number | null
  deviceLimit: number
  popular?: boolean
  current?: boolean
}

export function PlanCard({
  id,
  name,
  description,
  price,
  durationDays,
  trafficLimitGb,
  deviceLimit,
  popular,
  current,
}: PlanCardProps) {
  const [loading, setLoading] = useState(false)
  const [validatingPromo, setValidatingPromo] = useState(false)
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string
    discountPercent: number
    discountKopecks: number
    finalAmountKopecks: number
  } | null>(null)

  const trimmedPromo = promoInput.trim()
  const effectivePrice = appliedPromo ? formatPrice(appliedPromo.finalAmountKopecks) : price

  async function buy() {
    if (trimmedPromo && !appliedPromo) {
      toast('Сначала примените промокод или очистите поле')
      return
    }

    setLoading(true)
    try {
      const { confirmationUrl } = await apiFetch<{ confirmationUrl: string }>(
        '/api/payment/create',
        {
          method: 'POST',
          body: JSON.stringify({
            planId: id,
            ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
          }),
        }
      )
      if (confirmationUrl) {
        window.location.href = confirmationUrl
      } else {
        toast('Не получили ссылку на оплату')
      }
    } catch {
      // apiFetch показал toast
    } finally {
      setLoading(false)
    }
  }

  async function applyPromo() {
    if (!trimmedPromo) {
      toast('Введите промокод')
      return
    }

    setValidatingPromo(true)
    try {
      const discount = await apiFetch<{
        code: string
        discountPercent: number
        discountKopecks: number
        finalAmountKopecks: number
      }>('/api/promo-codes/validate', {
        method: 'POST',
        body: JSON.stringify({ planId: id, promoCode: trimmedPromo }),
      })
      setAppliedPromo(discount)
      setPromoInput(discount.code)
      toast('Промокод применён', 'success')
    } catch {
      setAppliedPromo(null)
    } finally {
      setValidatingPromo(false)
    }
  }

  function resetPromo() {
    setPromoInput('')
    setAppliedPromo(null)
  }

  return (
    <div
      className={cn(
        'card group relative flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl',
        popular && 'border-slate-950 ring-2 ring-slate-950/10 dark:border-white dark:ring-white/15',
        current && 'bg-cyan-50/70 dark:bg-cyan-500/10'
      )}
    >
      {popular && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-brand-500" />}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{name}</h3>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{durationDays} дней доступа</div>
        </div>
        {popular && (
          <span className="badge bg-slate-950 text-white dark:bg-white dark:text-slate-950">
            <Sparkles className="mr-1 h-3 w-3" />
            Популярный
          </span>
        )}
      </div>
      {current && <span className="mb-2 text-xs font-medium text-cyan-700 dark:text-cyan-200">Ваш текущий тариф</span>}
      {description && <p className="min-h-10 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      <div className="mt-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="text-4xl font-semibold tracking-tight">{effectivePrice}</div>
          {appliedPromo && (
            <div className="text-sm text-slate-400 line-through">{price}</div>
          )}
        </div>
        <div className="text-sm text-slate-500">оплата онлайн</div>
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <Feature strong>{trafficLimitGb == null ? 'Безлимитный трафик' : `${trafficLimitGb} ГБ трафика`}</Feature>
        <Feature>Ключи сразу после оплаты</Feature>
        <Feature>QR и ссылка подписки</Feature>
        <Feature>До {deviceLimit} устройств</Feature>
      </ul>
      {promoOpen || appliedPromo ? (
        <div className="mt-5 space-y-2">
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-surface-900">
            <Tag className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={promoInput}
              onChange={(event) => {
                setPromoInput(event.target.value)
                setAppliedPromo(null)
              }}
              placeholder="Промокод"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium uppercase outline-none placeholder:normal-case placeholder:text-slate-400"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
              onClick={applyPromo}
              disabled={validatingPromo}
              aria-label="Применить промокод"
            >
              <Check className="h-4 w-4" />
            </button>
            {promoInput ? (
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-surface-800 dark:hover:text-slate-200"
                onClick={resetPromo}
                aria-label="Очистить промокод"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {appliedPromo && (
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-300">
              Скидка {appliedPromo.discountPercent}%: -{formatPrice(appliedPromo.discountKopecks)}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="mt-5 inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
          onClick={() => setPromoOpen(true)}
        >
          <Tag className="h-4 w-4" />
          Есть промокод?
        </button>
      )}
      <button
        onClick={buy}
        disabled={loading}
        className="btn-primary mt-6"
      >
        <CreditCard className="h-4 w-4" />
        {loading ? 'Создаём платёж...' : current ? 'Продлить текущий' : 'Купить VPN'}
      </button>
    </div>
  )
}

function Feature({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <Check className="h-4 w-4 text-emerald-500" />
      <span className={strong ? 'font-medium text-slate-900 dark:text-white' : undefined}>{children}</span>
    </li>
  )
}
