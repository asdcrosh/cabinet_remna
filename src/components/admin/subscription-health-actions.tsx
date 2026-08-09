'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Wrench } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type ReconcileResult = {
  status?: string
  issues?: unknown[]
  changes?: string[]
  checked?: number
  healthy?: number
  warning?: number
  error?: number
}

export function SubscriptionHealthBatchButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      type="button"
      className="btn-primary w-full sm:w-auto"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        try {
          const response = await apiFetch<{ result: ReconcileResult }>('/api/admin/subscriptions/reconcile', {
            method: 'POST',
            body: JSON.stringify({ mode: 'AUTO', limit: 50 }),
          })
          const result = response.result
          toast(`Проверено: ${result.checked ?? 0}, требуют внимания: ${(result.warning ?? 0) + (result.error ?? 0)}`, result.error ? 'error' : 'success')
          router.refresh()
        } catch {
          // apiFetch показывает подробную ошибку
        } finally {
          setLoading(false)
        }
      }}
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Проверяем...' : 'Проверить подписки'}
    </button>
  )
}

export function SubscriptionHealthActions({ userId }: { userId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<'auto' | 'repair' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function run(mode: 'AUTO' | 'REPAIR') {
    setLoading(mode === 'AUTO' ? 'auto' : 'repair')
    try {
      const response = await apiFetch<{ result: ReconcileResult }>('/api/admin/subscriptions/reconcile', {
        method: 'POST',
        body: JSON.stringify({ userId, mode }),
      })
      const result = response.result
      toast(
        result.status === 'HEALTHY'
          ? 'Подписка согласована во всех системах'
          : `Осталось расхождений: ${result.issues?.length ?? 0}`,
        result.status === 'ERROR' ? 'error' : 'success'
      )
      setConfirmOpen(false)
      router.refresh()
    } catch {
      // apiFetch показывает подробную ошибку
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary px-3 text-xs" disabled={loading !== null} onClick={() => void run('AUTO')}>
        <RefreshCw className={`h-3.5 w-3.5 ${loading === 'auto' ? 'animate-spin' : ''}`} />
        Перепроверить
      </button>
      <button type="button" className="btn-primary px-3 text-xs" disabled={loading !== null} onClick={() => setConfirmOpen(true)}>
        <Wrench className="h-3.5 w-3.5" />
        Исправить
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Исправить подписку?"
        description="Cabinet применит параметры текущего тарифа в Remnawave, обновит устройства и повторно отправит подписку в Remnashop. Срок подписки не будет продлён."
        confirmLabel={loading === 'repair' ? 'Исправляем...' : 'Исправить'}
        loading={loading === 'repair'}
        tone="warning"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void run('REPAIR')}
      />
    </div>
  )
}
