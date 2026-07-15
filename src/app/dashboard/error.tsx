'use client'

import { RotateCcw } from 'lucide-react'
import { SystemState } from '@/components/ui/system-state'

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <SystemState
      className="mx-auto max-w-xl"
      tone="danger"
      eyebrow="Ошибка раздела"
      title="Не удалось загрузить данные"
      description="Повторите запрос. Остальные разделы кабинета продолжают работать."
      action={(
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Повторить
        </button>
      )}
    />
  )
}
