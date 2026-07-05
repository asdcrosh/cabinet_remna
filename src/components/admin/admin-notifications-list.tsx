'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCheck, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { AdminNotificationView } from '@/lib/admin-notifications'
import { AdminEmptyState } from './admin-empty-state'

const filters = [
  { value: 'ALL', label: 'Все' },
  { value: 'registration', label: 'Регистрации' },
  { value: 'payment', label: 'Оплаты' },
  { value: 'support', label: 'Поддержка' },
  { value: 'system', label: 'Система' },
]

export function AdminNotificationsList({ initialNotifications }: { initialNotifications: AdminNotificationView[] }) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState('ALL')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load(nextFilter = filter, nextOnlyUnread = onlyUnread) {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('type', nextFilter)
    if (nextOnlyUnread) params.set('filter', 'unread')
    try {
      const res = await fetch(`/api/admin/notifications?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && Array.isArray(data?.notifications)) setNotifications(data.notifications)
    } finally {
      setLoading(false)
    }
  }

  async function markAllRead() {
    setNotifications((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))
    )
    await fetch('/api/admin/notifications', { method: 'PATCH' }).catch(() => null)
    if (onlyUnread) setNotifications([])
  }

  async function markOneRead(id: string) {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item))
    )
    await fetch(`/api/admin/notifications/${id}`, { method: 'PATCH' }).catch(() => null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-surface-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-2 overflow-x-auto">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFilter(item.value)
                void load(item.value, onlyUnread)
              }}
              className={cn(
                'h-9 shrink-0 rounded-lg px-3 text-sm font-medium transition',
                filter === item.value
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !onlyUnread
              setOnlyUnread(next)
              void load(filter, next)
            }}
            className={cn(
              'h-9 rounded-lg px-3 text-sm font-medium transition',
              onlyUnread
                ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
            )}
          >
            Только новые
          </button>
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <CheckCheck className="h-4 w-4" />
            Прочитано
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-surface-950">
        {loading && <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500 dark:border-white/10">Загрузка...</div>}
        {notifications.length > 0 ? (
          notifications.map((item) => (
            <div key={item.id} className={cn('border-b border-slate-100 p-4 last:border-0 dark:border-white/10', !item.readAt && 'bg-cyan-50/40 dark:bg-cyan-950/10')}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.readAt && <span className="h-2 w-2 rounded-full bg-cyan-500" />}
                    <h3 className="text-base font-semibold text-slate-950 dark:text-white">{item.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
                      {typeLabel(item.type)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.body}</p>
                  <div className="mt-2 text-xs text-slate-400">{formatDate(item.createdAt)}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!item.readAt && (
                    <button
                      type="button"
                      onClick={() => void markOneRead(item.id)}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      Прочитано
                    </button>
                  )}
                  {item.actionHref && (
                    <Link
                      href={item.actionHref}
                      onClick={() => void markOneRead(item.id)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      {item.actionLabel || 'Открыть'}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4">
            <AdminEmptyState title="Уведомлений нет" description="Новые системные события появятся здесь." />
          </div>
        )}
      </div>
    </div>
  )
}

function typeLabel(type: string) {
  if (type === 'registration') return 'Регистрация'
  if (type === 'payment') return 'Оплата'
  if (type === 'support') return 'Поддержка'
  if (type === 'system') return 'Система'
  return type
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
