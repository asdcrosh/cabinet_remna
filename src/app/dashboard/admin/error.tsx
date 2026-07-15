'use client'

import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SystemState } from '@/components/ui/system-state'

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <SystemState
      className="mx-auto max-w-xl"
      tone="danger"
      eyebrow="Администрирование"
      title="Раздел не загрузился"
      description="Изменения не применялись. Повторите загрузку данных."
      action={(
        <Button variant="danger" className="w-full sm:w-auto" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Повторить
        </Button>
      )}
    />
  )
}
