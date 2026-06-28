'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Power, TicketCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

export type GiftCertificateRow = {
  id: string
  code: string
  planId: string
  planName: string
  durationDays: number
  maxUses: number
  maxUsesPerUser: number
  isActive: boolean
  startsAt: string | null
  expiresAt: string | null
  usedCount: number
}

type PlanOption = { id: string; name: string }

export function GiftCertificatesAdmin({
  certificates,
  plans,
}: {
  certificates: GiftCertificateRow[]
  plans: PlanOption[]
}) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const [durationDays, setDurationDays] = useState('30')
  const [maxUses, setMaxUses] = useState('1')
  const [maxUsesPerUser, setMaxUsesPerUser] = useState('1')
  const [loading, setLoading] = useState(false)

  async function createCertificate() {
    setLoading(true)
    try {
      await apiFetch('/api/admin/gift-certificates', {
        method: 'POST',
        body: JSON.stringify({
          code,
          planId,
          durationDays: Number(durationDays),
          maxUses: Number(maxUses),
          maxUsesPerUser: Number(maxUsesPerUser),
          isActive: true,
        }),
      })
      toast('Сертификат создан', 'success')
      setCode('')
      router.refresh()
    } catch {
      // apiFetch покажет ошибку.
    } finally {
      setLoading(false)
    }
  }

  async function toggle(certificate: GiftCertificateRow) {
    try {
      await apiFetch(`/api/admin/gift-certificates/${certificate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !certificate.isActive }),
      })
      toast(certificate.isActive ? 'Сертификат отключён' : 'Сертификат включён', 'success')
      router.refresh()
    } catch {
      // apiFetch покажет ошибку.
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-cyan-600" />
          <h2 className="font-semibold">Новый сертификат</h2>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="text-sm font-medium">Код</span>
            <input
              className="input mt-1 uppercase"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="GIFT30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Тариф</span>
            <select className="input mt-1" value={planId} onChange={(event) => setPlanId(event.target.value)}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-sm font-medium">Срок</span>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {['7', '30', '90'].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDurationDays(days)}
                  className={cn('rounded-lg border px-3 py-2 text-sm font-medium', durationDays === days ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'border-slate-200 bg-white dark:border-white/10 dark:bg-surface-900')}
                >
                  {days} дн.
                </button>
              ))}
              <input
                className="input h-10 px-2 text-center"
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Всего активаций</span>
              <input className="input mt-1" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">На пользователя</span>
              <input className="input mt-1" value={maxUsesPerUser} onChange={(event) => setMaxUsesPerUser(event.target.value)} />
            </label>
          </div>

          <button
            type="button"
            className="btn-primary min-h-11 justify-center"
            disabled={loading || !code.trim() || !planId}
            onClick={createCertificate}
          >
            <TicketCheck className="h-4 w-4" />
            {loading ? 'Создаём...' : 'Создать сертификат'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-slate-100 p-4 dark:border-white/10">
          <h2 className="font-semibold">Сертификаты</h2>
          <p className="text-sm text-slate-500">Коды для бесплатной выдачи подписки.</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          {certificates.length === 0 && (
            <div className="p-6 text-sm text-slate-500">Сертификатов пока нет.</div>
          )}
          {certificates.map((certificate) => (
            <div key={certificate.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-semibold">{certificate.code}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', certificate.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    {certificate.isActive ? 'Активен' : 'Отключён'}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {certificate.planName} · {certificate.durationDays} дн. · использовано {certificate.usedCount}/{certificate.maxUses}
                </div>
              </div>
              <button type="button" className="btn-secondary min-h-10 px-3" onClick={() => toggle(certificate)}>
                <Power className="h-4 w-4" />
                {certificate.isActive ? 'Отключить' : 'Включить'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
