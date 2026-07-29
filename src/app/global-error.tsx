'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { SystemState } from '@/components/ui/system-state'
import { reportClientError } from '@/lib/client-logger'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError('ui.global_error', error)
  }, [error])

  return (
    <html lang="ru">
      <body className="bg-slate-50 text-slate-950 antialiased dark:bg-slate-950 dark:text-white">
        <main className="grid min-h-dvh place-items-center px-4 py-8">
          <SystemState
            tone="danger"
            eyebrow="Критическая ошибка"
            title="Кабинет временно недоступен"
            description="Перезапустите страницу. Если ошибка повторится, попробуйте зайти немного позже."
            reference={error.digest}
            action={(
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Перезапустить
              </button>
            )}
          />
        </main>
      </body>
    </html>
  )
}
