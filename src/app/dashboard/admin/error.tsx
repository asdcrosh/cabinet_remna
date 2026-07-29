'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SystemState } from '@/components/ui/system-state'
import { reportClientError } from '@/lib/client-logger'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError('ui.admin_error', error)
  }, [error])

  return (
    <SystemState
      className="mx-auto max-w-xl"
      tone="danger"
      eyebrow="Администрирование"
      title="Раздел не загрузился"
      description="Изменения не применялись. Повторите загрузку данных."
      reference={error.digest}
      action={(
        <Button variant="danger" className="w-full sm:w-auto" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Повторить
        </Button>
      )}
    />
  )
}
