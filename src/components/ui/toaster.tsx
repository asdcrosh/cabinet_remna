// Крошечный Toaster на клиентских компонентах. Используется глобально,
// чтобы любой fetch мог показать ошибку через toast.error(message).

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'

type Toast = { id: number; type: 'error' | 'success'; message: string }

let listeners: Array<(t: Toast) => void> = []

export function toast(message: string, type: 'error' | 'success' = 'error') {
  listeners.forEach((fn) => fn({ id: Date.now() + Math.random(), type, message }))
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  const timersRef = useRef(new Map<number, number>())
  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) window.clearTimeout(timer)
    timersRef.current.delete(id)
    setItems((previous) => previous.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    const fn = (t: Toast) => {
      setItems((prev) => [...prev, t])
      const timer = window.setTimeout(() => dismiss(t.id), 6000)
      timers.set(t.id, timer)
    }
    listeners.push(fn)
    return () => {
      listeners = listeners.filter((l) => l !== fn)
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [dismiss])

  return (
    <div aria-label="Системные уведомления" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.35rem)] z-[250] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:items-stretch">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          aria-live={t.type === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
          className={`toast-enter flex w-full max-w-sm items-start gap-2 rounded-2xl py-2 pl-3 pr-1 text-sm leading-5 shadow-2xl shadow-slate-950/15 backdrop-blur sm:w-auto sm:max-w-none sm:py-2.5 sm:pl-4 ${
            t.type === 'error'
              ? 'border border-red-400/30 bg-red-600/95 text-white'
              : 'border border-emerald-300/30 bg-emerald-600/95 text-white'
          }`}
        >
          {t.type === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1 break-words py-0.5">{t.message}</span>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label="Закрыть уведомление"
            onClick={() => dismiss(t.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
