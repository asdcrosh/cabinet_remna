'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { RotateCcw } from 'lucide-react'
import { SystemState } from '@/components/ui/system-state'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
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
