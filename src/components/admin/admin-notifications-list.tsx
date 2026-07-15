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
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 dark:bg-white/[0.05]">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFilter(item.value)
                void load(item.value, onlyUnread)
              }}
              aria-pressed={filter === item.value}
              className={cn(
                'h-9 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors',
                filter === item.value
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => {
              const next = !onlyUnread
              setOnlyUnread(next)
              void load(filter, next)
            }}
            aria-pressed={onlyUnread}
            className={cn(
              'h-10 rounded-xl px-3 text-sm font-medium transition-colors',
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
            disabled={loading}
            className="btn-secondary h-10 min-h-10 px-3"
          >
            <CheckCheck className="h-4 w-4" />
            Прочитать все
          </button>
        </div>
      </div>

      <div className="space-y-3" aria-busy={loading}>
        {loading && <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-500 dark:bg-white/[0.05]">Загрузка...</div>}
        {notifications.length > 0 ? (
          notifications.map((item) => (
            <article key={item.id} className={cn('rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035]', !item.readAt && 'border-cyan-200 bg-cyan-50/50 dark:border-cyan-500/25 dark:bg-cyan-950/10')}>
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
                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  {!item.readAt && (
                    <button
                      type="button"
                      onClick={() => void markOneRead(item.id)}
                      className="btn-secondary h-10 min-h-10 flex-1 px-3 sm:flex-none"
                    >
                      Прочитано
                    </button>
                  )}
                  {item.actionHref && (
                    <Link
                      href={item.actionHref}
                      onClick={() => void markOneRead(item.id)}
                      className="btn-primary h-10 min-h-10 flex-1 px-3 sm:flex-none"
                    >
                      {item.actionLabel || 'Открыть'}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))
        ) : (
          <AdminEmptyState title="Уведомлений нет" description="Новые системные события появятся здесь." />
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
