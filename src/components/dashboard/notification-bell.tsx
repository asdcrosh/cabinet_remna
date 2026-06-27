'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { UserNotificationView } from '@/lib/user-notifications'

type NotificationSummary = {
  unreadCount: number
  notifications: UserNotificationView[]
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<NotificationSummary>({ unreadCount: 0, notifications: [] })
  const rootRef = useRef<HTMLDivElement | null>(null)

  async function refresh() {
    try {
      const res = await fetch('/api/notifications/summary', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        setSummary({
          unreadCount: Number(data.unreadCount || 0),
          notifications: Array.isArray(data.notifications) ? data.notifications : [],
        })
      }
    } catch {
      // Silent polling. The last known state is enough for the header.
    }
  }

  async function markAllRead() {
    const previous = summary
    setSummary((current) => ({
      unreadCount: 0,
      notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    }))
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH' })
      if (!res.ok) setSummary(previous)
    } catch {
      setSummary(previous)
    }
  }

  async function markOneRead(id: string) {
    setSummary((current) => ({
      unreadCount: Math.max(0, current.unreadCount - (current.notifications.find((item) => item.id === id)?.readAt ? 0 : 1)),
      notifications: current.notifications.map((item) =>
        item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
      ),
    }))
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    } catch {
      // Counter will self-heal on the next polling cycle.
    }
  }

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 5000)
    const onFocus = () => void refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-10 w-10 place-items-center rounded-lg border border-white/70 bg-white/80 text-slate-700 shadow-sm shadow-slate-200/60 transition hover:bg-white hover:text-slate-950 dark:border-white/10 dark:bg-surface-900/80 dark:text-slate-200 dark:shadow-black/20 dark:hover:bg-surface-800 dark:hover:text-white"
        aria-label="Уведомления"
      >
        <Bell className="h-5 w-5" />
        {summary.unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-surface-950">
            {summary.unreadCount > 99 ? '99+' : summary.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 dark:border-white/10 dark:bg-surface-950 dark:shadow-black/30">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <div className="text-sm font-semibold text-slate-950 dark:text-white">Уведомления</div>
              <div className="text-xs text-slate-500">
                {summary.unreadCount > 0 ? `Новых: ${summary.unreadCount}` : 'Новых нет'}
              </div>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={summary.unreadCount === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Прочитано
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {summary.notifications.length > 0 ? (
              summary.notifications.map((item) => (
                <NotificationRow
                  key={item.id}
                  notification={item}
                  onNavigate={() => {
                    void markOneRead(item.id)
                    setOpen(false)
                  }}
                />
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Уведомлений пока нет</div>
            )}
          </div>

          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          >
            Все уведомления
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: UserNotificationView
  onNavigate: () => void
}) {
  const content = (
    <div
      className={cn(
        'rounded-lg px-3 py-2.5 transition',
        notification.readAt ? 'hover:bg-slate-50 dark:hover:bg-white/10' : 'bg-cyan-50/70 hover:bg-cyan-50 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/30'
      )}
    >
      <div className="flex items-start gap-2">
        {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-500" />}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-semibold text-slate-950 dark:text-white">{notification.title}</div>
          <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{notification.body}</div>
          <div className="mt-1 text-[11px] text-slate-400">{formatDate(notification.createdAt)}</div>
        </div>
      </div>
    </div>
  )

  if (notification.actionHref) {
    return (
      <Link href={notification.actionHref} onClick={onNavigate} className="block">
        {content}
      </Link>
    )
  }

  return content
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
