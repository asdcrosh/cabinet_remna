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
      className="btn-primary min-w-[112px] px-3 text-xs"
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

export function PaymentSyncButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      className="btn-secondary min-w-[112px] px-3 text-xs"
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
