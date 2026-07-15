'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'

export function RecoveryActionButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      type="button"
      className="btn-primary min-w-[112px] w-full px-3 text-xs sm:w-auto"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        try {
          const result = await apiFetch<{ ok: boolean; alreadyProvisioned?: boolean }>('/api/admin/sync', {
            method: 'POST',
            body: JSON.stringify({ paymentId }),
          })
          toast(result.alreadyProvisioned ? 'Подписка уже была выдана' : 'Подписка довыдана', 'success')
          router.refresh()
        } catch {
          // apiFetch уже покажет toast
        } finally {
          setLoading(false)
        }
      }}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {loading ? 'Выдаём...' : 'Довыдать'}
    </button>
  )
}

export function BulkRecoveryActionButton({ paymentIds }: { paymentIds: string[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const uniquePaymentIds = Array.from(new Set(paymentIds)).slice(0, 100)

  return (
    <button
      type="button"
      className="btn-primary w-full sm:w-auto"
      disabled={loading || uniquePaymentIds.length === 0}
      onClick={async () => {
        setLoading(true)
        try {
          const result = await apiFetch<{
            total: number
            provisioned: number
            alreadyProvisioned: number
            failed: number
          }>('/api/admin/sync', {
            method: 'POST',
            body: JSON.stringify({ paymentIds: uniquePaymentIds }),
          })
          toast(
            `Довыдача: ${result.provisioned} выдано, ${result.alreadyProvisioned} уже было, ${result.failed} ошибок из ${result.total}`,
            result.failed > 0 ? 'error' : 'success'
          )
          router.refresh()
        } catch {
          // apiFetch уже покажет toast
        } finally {
          setLoading(false)
        }
      }}
    >
      <RefreshCw className="h-4 w-4" />
      {loading ? 'Выдаём...' : `Довыдать все (${uniquePaymentIds.length})`}
    </button>
  )
}

export function PaymentSyncButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      type="button"
      className="btn-secondary min-w-[112px] w-full px-3 text-xs sm:w-auto"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        try {
          const result = await apiFetch<{
            ok: boolean
            paymentStatus?: string
            yookassaStatus?: string
            provisioned?: boolean
            alreadyProvisioned?: boolean
          }>('/api/admin/payment-sync', {
            method: 'POST',
            body: JSON.stringify({ paymentId }),
          })

          if (result.alreadyProvisioned) {
            toast('Платёж проверен, подписка уже была выдана', 'success')
          } else if (result.provisioned) {
            toast('Платёж оплачен, подписка выдана', 'success')
          } else if (result.paymentStatus === 'CANCELED') {
            toast('ЮKassa вернула отменённый платёж', 'success')
          } else {
            toast(`Платёж ещё не завершён: ${result.yookassaStatus || result.paymentStatus || 'ожидает'}`, 'success')
          }

          router.refresh()
        } catch {
          // apiFetch уже покажет toast
        } finally {
          setLoading(false)
        }
      }}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {loading ? 'Проверяем...' : 'Проверить'}
    </button>
  )
}

export function RemnashopPaymentRetryButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      type="button"
      className="btn-secondary min-w-[112px] w-full px-3 text-xs sm:w-auto"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        try {
          await apiFetch('/api/admin/remnashop-sync/retry-payment', {
            method: 'POST',
            body: JSON.stringify({ paymentId }),
          })
          toast('Платёж отправлен в Remnashop', 'success')
          router.refresh()
        } catch {
          // apiFetch уже покажет toast
        } finally {
          setLoading(false)
        }
      }}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {loading ? 'Синхронизация...' : 'Повторить sync'}
    </button>
  )
}
