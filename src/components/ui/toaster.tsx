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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-3 text-sm shadow-lg ${
            t.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
