'use client'

import { useRef, useState } from 'react'
import { CreditCard, Minus, MonitorSmartphone, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatPrice } from '@/lib/format'
import type { CheckoutPaymentProvider } from '@/lib/payment-providers'
import { Modal } from '@/components/ui/modal'
import { toast } from '@/components/ui/toaster'

type Provider = { id: CheckoutPaymentProvider; label: string }

export function HomeDeviceAddon({
  planId,
  currentLimit,
  maxLimit,
  extraDevicePriceKopecks,
  expireAt,
  paymentProviders,
}: {
  planId: string
  currentLimit: number
  maxLimit: number
  extraDevicePriceKopecks: number
  expireAt: string
  paymentProviders: Provider[]
}) {
  const [open, setOpen] = useState(false)
  const [targetLimit, setTargetLimit] = useState(currentLimit + 1)
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<CheckoutPaymentProvider>(paymentProviders[0]?.id ?? 'YOOKASSA')
  const checkoutKeyRef = useRef<string | null>(null)
  const remainingDays = Math.max(1, Math.ceil((new Date(expireAt).getTime() - Date.now()) / 86_400_000))
  const additionalDevices = targetLimit - currentLimit
  const amountKopecks = Math.max(100, Math.ceil(
    additionalDevices * extraDevicePriceKopecks * Math.min(remainingDays, 30) / 30 / 100
  ) * 100)

  async function buy() {
    if (paymentProviders.length === 0) return toast('Оплата временно недоступна')
    checkoutKeyRef.current ??= crypto.randomUUID()
    setLoading(true)
    try {
      const result = await apiFetch<{ confirmationUrl?: string; redirectUrl?: string }>('/api/payment/create', {
        method: 'POST',
        body: JSON.stringify({
          planId,
          purchaseType: 'DEVICE_LIMIT_ADDON',
          deviceLimit: targetLimit,
          provider,
          idempotencyKey: checkoutKeyRef.current,
        }),
      })
      const paymentUrl = result.confirmationUrl ?? result.redirectUrl
      if (!paymentUrl) {
        checkoutKeyRef.current = null
        return toast('Не получили ссылку на оплату')
      }
      window.location.href = paymentUrl
    } catch {
      checkoutKeyRef.current = null
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 dark:border-cyan-400/20 dark:bg-cyan-400/[0.06] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
            <MonitorSmartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950 dark:text-white">Дополнительные устройства</div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Сейчас доступно {currentLimit}, можно увеличить до {maxLimit} до конца текущей подписки
            </p>
          </div>
        </div>
        <button type="button" className="btn-primary w-full shrink-0 sm:w-auto" disabled={paymentProviders.length === 0} onClick={() => setOpen(true)}>
          <CreditCard className="h-4 w-4" />
          Докупить устройства
        </button>
      </section>

      <Modal
        open={open}
        title="Докупить устройства"
        description="Лимит увеличится сразу после оплаты, срок подписки не изменится"
        panelClassName="sm:max-w-[30rem]"
        onClose={() => !loading && setOpen(false)}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" disabled={loading} onClick={() => setOpen(false)}>Назад</button>
            <button type="button" className="btn-primary min-w-[12rem] justify-between" disabled={loading} onClick={() => void buy()}>
              <span>{loading ? 'Создаём платёж...' : 'Оплатить'}</span>
              <span className="tabular-nums">{formatPrice(amountKopecks)}</span>
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
            <div className="text-sm font-semibold text-slate-950 dark:text-white">Сколько устройств добавить</div>
            <div className="mt-3 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
              <button type="button" className="btn-secondary h-11 w-11 p-0" disabled={targetLimit <= currentLimit + 1} onClick={() => setTargetLimit((value) => value - 1)} aria-label="Уменьшить">
                <Minus className="h-4 w-4" />
              </button>
              <div className="text-center text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">+{additionalDevices}</div>
              <button type="button" className="btn-secondary h-11 w-11 p-0" disabled={targetLimit >= maxLimit} onClick={() => setTargetLimit((value) => value + 1)} aria-label="Увеличить">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-white/10">
              <span className="text-slate-500 dark:text-slate-400">Новый лимит: {targetLimit}</span>
              <strong className="tabular-nums text-slate-950 dark:text-white">{formatPrice(amountKopecks)}</strong>
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            Цена устройства указана за 30 дней и рассчитана пропорционально оставшимся {remainingDays} дням. Если включено автопродление, новый лимит и сумму нужно будет подтвердить заново.
          </p>
          {paymentProviders.length > 1 ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Способ оплаты</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value as CheckoutPaymentProvider)} className="input">
                {paymentProviders.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
