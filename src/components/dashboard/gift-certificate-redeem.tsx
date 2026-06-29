'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, TicketCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { AdminModal } from '@/components/admin/admin-modal'

export function GiftCertificateRedeem() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (code.trim().length < 3) return
    setLoading(true)
    try {
      const result = await apiFetch<{ provisioned: boolean }>('/api/gift-certificates/redeem', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      toast(result.provisioned ? 'Сертификат активирован' : 'Сертификат принят, подписка выдаётся', 'success')
      setCode('')
      setOpen(false)
      router.push('/dashboard/subscription')
      router.refresh()
    } catch {
      // apiFetch покажет ошибку.
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        <Gift className="h-4 w-4" />
        У меня есть подарочный сертификат
      </button>

      <AdminModal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Подарочный сертификат"
        description="Введите код сертификата, чтобы получить подарочный период."
        size="md"
      >
        <form onSubmit={redeem} className="space-y-5">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="flex gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm dark:bg-white/10 dark:text-emerald-100">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Активируйте подарок</div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                  Сертификат не является промокодом на тариф. Его нужно вводить здесь.
                </p>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="label">Код сертификата</span>
            <input
              className="input uppercase"
              value={code}
              onChange={(event) => setCode(event.target.value.trim().toUpperCase())}
              placeholder="GIFT30"
              maxLength={64}
              autoFocus
            />
          </label>

          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={loading}>
              Отмена
            </button>
            <button type="submit" className="btn-primary" disabled={loading || code.trim().length < 3}>
              <TicketCheck className="h-4 w-4" />
              {loading ? 'Проверяем...' : 'Активировать'}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  )
}
