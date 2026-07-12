'use client'

import { AlertTriangle } from 'lucide-react'

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-xl py-12 text-center">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold">Не удалось загрузить раздел</h1>
      <p className="mt-2 text-sm text-slate-500">Попробуйте обновить данные. Если ошибка повторяется, обратитесь в поддержку.</p>
      <button type="button" className="btn-primary mt-6" onClick={reset}>Повторить</button>
    </div>
  )
}
