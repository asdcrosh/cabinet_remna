'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-950 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-white text-red-600 shadow-sm dark:bg-red-500/15 dark:text-red-200">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold">Админ-раздел не загрузился</h1>
      <p className="mt-2 text-sm text-red-800/80 dark:text-red-100/80">
        Данные не потеряны. Попробуйте повторить запрос.
      </p>
      <Button variant="danger" className="mt-5" onClick={reset}>
        Повторить
      </Button>
    </div>
  )
}
