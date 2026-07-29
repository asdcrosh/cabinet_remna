'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { SystemState } from '@/components/ui/system-state'
import { reportClientError } from '@/lib/client-logger'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError('ui.dashboard_error', error)
  }, [error])

  return (
    <SystemState
      className="mx-auto max-w-xl"
      tone="danger"
      eyebrow="Ошибка раздела"
      title="Не удалось загрузить данные"
      description="Повторите запрос. Остальные разделы кабинета продолжают работать."
      reference={error.digest}
      action={(
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Повторить
        </button>
      )}
    />
  )
}
