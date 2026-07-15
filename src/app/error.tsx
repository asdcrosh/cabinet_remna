'use client'

import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SystemState } from '@/components/ui/system-state'

export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 text-slate-950 dark:bg-slate-950 dark:text-white">
      <SystemState
        tone="danger"
        eyebrow="Ошибка загрузки"
        title="Что-то пошло не так"
        description="Повторите загрузку страницы. Если ошибка сохранится, попробуйте зайти немного позже."
        action={(
          <Button className="w-full sm:w-auto" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Повторить
          </Button>
        )}
      />
    </main>
  )
}
