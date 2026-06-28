'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, TicketCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

export function GiftCertificateRedeem() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function redeem() {
    setLoading(true)
    try {
      const result = await apiFetch<{ provisioned: boolean }>('/api/gift-certificates/redeem', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      toast(result.provisioned ? 'Сертификат активирован' : 'Сертификат принят, подписка выдаётся', 'success')
      setCode('')
      router.push('/dashboard/subscription')
      router.refresh()
    } catch {
      // apiFetch покажет ошибку.
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-100">
            <Gift className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Подарочный сертификат</div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Введите код, чтобы активировать бесплатный период.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto]">
          <input
            className="input uppercase"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="GIFT30"
            maxLength={64}
          />
          <button type="button" className="btn-primary min-h-11 justify-center px-4" onClick={redeem} disabled={loading || code.trim().length < 3}>
            <TicketCheck className="h-4 w-4" />
            {loading ? 'Проверяем...' : 'Активировать'}
          </button>
        </div>
      </div>
    </section>
  )
}
