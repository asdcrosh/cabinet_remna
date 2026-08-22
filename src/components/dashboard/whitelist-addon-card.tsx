'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, CreditCard, Globe2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatPrice } from '@/lib/format'
import { toast } from '@/components/ui/toaster'
import type { CheckoutPaymentProvider } from '@/lib/payment-providers'

type Provider = {
  id: CheckoutPaymentProvider
  label: string
}

export function WhitelistAddonCard({
  planId,
  priceKopecks,
  active,
  expiresAt,
  paymentProviders,
}: {
  planId: string
  priceKopecks: number
  active: boolean
  expiresAt: string
  paymentProviders: Provider[]
}) {
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<CheckoutPaymentProvider>(
    paymentProviders[0]?.id ?? 'YOOKASSA'
  )
  const checkoutKeyRef = useRef<string | null>(null)

  async function buy() {
    if (paymentProviders.length === 0) {
      toast('Оплата временно недоступна')
      return
    }
    checkoutKeyRef.current ??= crypto.randomUUID()
    setLoading(true)
    try {
      const result = await apiFetch<{ confirmationUrl?: string; redirectUrl?: string }>(
        '/api/payment/create',
        {
          method: 'POST',
          body: JSON.stringify({
            planId,
            purchaseType: 'WHITELIST_ADDON',
            provider,
            idempotencyKey: checkoutKeyRef.current,
          }),
        }
      )
      const redirectUrl = result.confirmationUrl ?? result.redirectUrl
      if (!redirectUrl) {
        toast('Не получили ссылку на оплату')
        return
      }
      window.location.href = redirectUrl
    } catch (error) {
      checkoutKeyRef.current = null
      throw error
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-400/20 dark:from-amber-400/[0.08] dark:to-white/[0.02] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-200">
            <Globe2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-950 dark:text-white">Серверы с белыми списками</h2>
              {active ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Активно
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              {active
                ? `Дополнительные серверы доступны до ${expiresAt}.`
                : `Подключите дополнительные серверы за ${formatPrice(priceKopecks)} до ${expiresAt}. При следующем продлении дополнение нужно оплатить снова.`}
            </p>
          </div>
        </div>

        {!active ? (
          <div className="grid shrink-0 gap-2 sm:min-w-52">
            {paymentProviders.length > 1 ? (
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as CheckoutPaymentProvider)}
                className="input min-h-10 py-2 text-sm"
                aria-label="Способ оплаты дополнения"
              >
                {paymentProviders.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="btn-primary w-full"
              disabled={loading || paymentProviders.length === 0}
              onClick={() => void buy()}
            >
              <CreditCard className="h-4 w-4" />
              {loading ? 'Создаём платёж...' : `Подключить за ${formatPrice(priceKopecks)}`}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
