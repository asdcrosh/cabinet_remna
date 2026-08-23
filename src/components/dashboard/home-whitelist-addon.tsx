'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, CreditCard, Globe2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatPrice } from '@/lib/format'
import type { CheckoutPaymentProvider } from '@/lib/payment-providers'
import { Modal } from '@/components/ui/modal'
import { toast } from '@/components/ui/toaster'

type Provider = {
  id: CheckoutPaymentProvider
  label: string
}

export function HomeWhitelistAddon({
  planId,
  priceKopecks,
  active,
  expireAt,
  paymentProviders,
}: {
  planId: string
  priceKopecks: number
  active: boolean
  expireAt: string | null
  paymentProviders: Provider[]
}) {
  const [open, setOpen] = useState(false)
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
      const paymentUrl = result.confirmationUrl ?? result.redirectUrl
      if (!paymentUrl) {
        checkoutKeyRef.current = null
        toast('Не получили ссылку на оплату')
        return
      }
      window.location.href = paymentUrl
    } catch {
      checkoutKeyRef.current = null
    } finally {
      setLoading(false)
    }
  }

  const purchaseModal = (
    <Modal
      open={open}
      title={active ? 'Продлить белые списки' : 'Докупить белые списки'}
      description="Только для приложения INCY. Текущий тариф повторно оплачивать не нужно"
      panelClassName="sm:max-w-[30rem]"
      onClose={() => {
        if (!loading) setOpen(false)
      }}
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => setOpen(false)}>
            Назад
          </button>
          <button type="button" className="btn-primary min-w-[12rem] justify-between" disabled={loading} onClick={() => void buy()}>
            <span>{loading ? 'Создаём платёж...' : 'Оплатить'}</span>
            <span className="tabular-nums">{formatPrice(priceKopecks)}</span>
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-5 text-slate-700 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-slate-200">
          {active
            ? 'К текущей дате окончания добавятся ещё 30 дней. Оставшиеся оплаченные дни не сгорят.'
            : 'БС работают только в приложении INCY. Доступ включится сразу после оплаты ровно на 30 дней. Затем группы БС автоматически снимутся.'}
        </div>
        {paymentProviders.length > 1 ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Способ оплаты</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as CheckoutPaymentProvider)}
              className="input"
            >
              {paymentProviders.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </Modal>
  )

  if (active) {
    return (
      <>
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-wide text-emerald-800 dark:text-emerald-200">БС ПОДКЛЮЧЕН</div>
              <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-200/70">
                {expireAt
                  ? `Действует до ${new Date(expireAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}`
                  : 'Действует 30 дней с даты оплаты'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary w-full shrink-0 sm:w-auto"
            disabled={paymentProviders.length === 0}
            onClick={() => setOpen(true)}
          >
            Продлить БС на 30 дней
          </button>
        </section>
        {purchaseModal}
      </>
    )
  }

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-400/[0.06] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <Globe2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950 dark:text-white">Серверы с белыми списками</div>
            <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Только для приложения INCY</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Доплата только за БС, без повторной оплаты тарифа</p>
          </div>
        </div>
        <button
          type="button"
          className="btn-primary w-full shrink-0 sm:w-auto"
          disabled={paymentProviders.length === 0}
          onClick={() => setOpen(true)}
        >
          <CreditCard className="h-4 w-4" />
          Докупить БС за {formatPrice(priceKopecks)}
        </button>
      </section>

      {purchaseModal}
    </>
  )
}
