'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BellRing, CheckCheck, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { AdminNotificationView } from '@/lib/admin-notifications'

const ADMIN_NOTIFICATION_REFRESH_MS = 15_000

type AdminNotificationSummary = {
  unreadCount: number
  notifications: AdminNotificationView[]
}

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<AdminNotificationSummary>({ unreadCount: 0, notifications: [] })
  const rootRef = useRef<HTMLDivElement | null>(null)

  async function refresh() {
    try {
      const res = await fetch('/api/admin/notifications/summary', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        setSummary({
          unreadCount: Number(data.unreadCount || 0),
          notifications: Array.isArray(data.notifications) ? data.notifications : [],
        })
      }
    } catch {
      // Header polling keeps the last known state.
    }
  }

  async function markAllRead() {
    const previous = summary
    setSummary((current) => ({
      unreadCount: 0,
      notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    }))
    try {
      const res = await fetch('/api/admin/notifications', { method: 'PATCH' })
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
      await fetch(`/api/admin/notifications/${id}`, { method: 'PATCH' })
    } catch {
      // The next polling cycle will restore the counter.
    }
  }

  async function clearNotifications() {
    if (summary.notifications.length === 0) return
    if (!window.confirm('Очистить админские уведомления?')) return
    const previous = summary
    setSummary({ unreadCount: 0, notifications: [] })
    try {
      const res = await fetch('/api/admin/notifications', { method: 'DELETE' })
      if (!res.ok) setSummary(previous)
    } catch {
      setSummary(previous)
    }
  }

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, ADMIN_NOTIFICATION_REFRESH_MS)
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
        className="relative grid h-10 w-10 place-items-center rounded-lg border border-cyan-100 bg-cyan-50/80 text-cyan-800 shadow-sm shadow-slate-200/60 transition hover:bg-cyan-50 hover:text-slate-950 dark:border-cyan-400/20 dark:bg-cyan-950/30 dark:text-cyan-200 dark:shadow-black/20"
        aria-label="Админские уведомления"
      >
        <BellRing className="h-5 w-5" />
        {summary.unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-orange-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-surface-950">
            {summary.unreadCount > 99 ? '99+' : summary.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 dark:border-white/10 dark:bg-surface-950 dark:shadow-black/30 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(25rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <div className="text-sm font-semibold text-slate-950 dark:text-white">Админские уведомления</div>
              <div className="text-xs text-slate-500">
                {summary.unreadCount > 0 ? `Новых: ${summary.unreadCount}` : 'Новых нет'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={markAllRead}
                disabled={summary.unreadCount === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Прочитано
              </button>
              <button
                type="button"
                onClick={clearNotifications}
                disabled={summary.notifications.length === 0}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-200"
                title="Очистить"
                aria-label="Очистить уведомления"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto p-2 sm:max-h-96">
            {summary.notifications.length > 0 ? (
              summary.notifications.map((item) => (
                <AdminNotificationRow
                  key={item.id}
                  notification={item}
                  onNavigate={() => {
                    void markOneRead(item.id)
                    setOpen(false)
                  }}
                />
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Событий пока нет</div>
            )}
          </div>

          <Link
            href="/dashboard/admin/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          >
            Все события
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

function AdminNotificationRow({
  notification,
  onNavigate,
}: {
  notification: AdminNotificationView
  onNavigate: () => void
}) {
  const content = (
    <div
      className={cn(
        'rounded-lg px-3 py-2.5 transition',
        notification.readAt ? 'hover:bg-slate-50 dark:hover:bg-white/10' : 'bg-orange-50/80 hover:bg-orange-50 dark:bg-orange-950/20 dark:hover:bg-orange-950/30'
      )}
    >
      <div className="flex items-start gap-2">
        {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="line-clamp-1 text-sm font-semibold text-slate-950 dark:text-white">{notification.title}</span>
            <SeverityBadge severity={notification.severity} />
          </div>
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

function SeverityBadge({ severity }: { severity: string }) {
  const label = severity === 'ERROR' ? 'Ошибка' : severity === 'WARNING' ? 'Внимание' : severity === 'SUCCESS' ? 'Готово' : null
  if (!label) return null
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
        severity === 'ERROR' && 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200',
        severity === 'WARNING' && 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
        severity === 'SUCCESS' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
      )}
    >
      {label}
    </span>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
