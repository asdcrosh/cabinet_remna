'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 text-slate-950 dark:bg-slate-950 dark:text-white">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Обновите страницу. Если ошибка повторяется, напишите в поддержку.
        </p>
        <Button className="mt-6 w-full" onClick={reset}>
          Повторить
        </Button>
      </section>
    </main>
  )
}
