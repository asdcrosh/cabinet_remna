// Крошечный Toaster на клиентских компонентах. Используется глобально,
// чтобы любой fetch мог показать ошибку через toast.error(message).

'use client'

import { useEffect, useState } from 'react'

type Toast = { id: number; type: 'error' | 'success'; message: string }

let listeners: Array<(t: Toast) => void> = []

export function toast(message: string, type: 'error' | 'success' = 'error') {
  listeners.forEach((fn) => fn({ id: Date.now() + Math.random(), type, message }))
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const fn = (t: Toast) => {
      setItems((prev) => [...prev, t])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== t.id)), 4000)
    }
    listeners.push(fn)
    return () => {
      listeners = listeners.filter((l) => l !== fn)
    }
  }, [])
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.35rem)] z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96 sm:items-stretch">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`w-full max-w-sm rounded-lg px-3 py-2.5 text-sm leading-5 shadow-2xl shadow-slate-950/15 backdrop-blur sm:w-auto sm:max-w-none sm:px-4 sm:py-3 ${
            t.type === 'error'
              ? 'border border-red-400/30 bg-red-600/95 text-white'
              : 'border border-emerald-300/30 bg-emerald-600/95 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
