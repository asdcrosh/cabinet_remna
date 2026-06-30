'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { UserNotificationView } from '@/lib/user-notifications'
import type { AdminNotificationView } from '@/lib/admin-notifications'

type NotificationSummary = {
  unreadCount: number
  notifications: UserNotificationView[]
}

type AdminNotificationSummary = {
  unreadCount: number
  notifications: AdminNotificationView[]
}

export function NotificationBell({ showAdmin = false }: { showAdmin?: boolean }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'user' | 'admin'>('user')
  const [summary, setSummary] = useState<NotificationSummary>({ unreadCount: 0, notifications: [] })
  const [adminSummary, setAdminSummary] = useState<AdminNotificationSummary>({ unreadCount: 0, notifications: [] })
  const rootRef = useRef<HTMLDivElement | null>(null)
  const activeSummary = tab === 'admin' ? adminSummary : summary
  const totalUnread = summary.unreadCount + (showAdmin ? adminSummary.unreadCount : 0)

  const refresh = useCallback(async () => {
    try {
      const [userRes, adminRes] = await Promise.all([
        fetch('/api/notifications/summary', { cache: 'no-store' }),
        showAdmin ? fetch('/api/admin/notifications/summary', { cache: 'no-store' }) : Promise.resolve(null),
      ])
      const data = await userRes.json().catch(() => null)
      if (userRes.ok && data) {
        setSummary({
          unreadCount: Number(data.unreadCount || 0),
          notifications: Array.isArray(data.notifications) ? data.notifications : [],
        })
      }
      if (adminRes) {
        const adminData = await adminRes.json().catch(() => null)
        if (adminRes.ok && adminData) {
          setAdminSummary({
            unreadCount: Number(adminData.unreadCount || 0),
            notifications: Array.isArray(adminData.notifications) ? adminData.notifications : [],
          })
        }
      }
    } catch {
      // Silent polling. The last known state is enough for the header.
    }
  }, [showAdmin])

  async function markAllRead() {
    const previousUser = summary
    const previousAdmin = adminSummary
    if (tab === 'admin') {
      setAdminSummary((current) => ({
        unreadCount: 0,
        notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      }))
    } else {
      setSummary((current) => ({
        unreadCount: 0,
        notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      }))
    }
    try {
      const res = await fetch(tab === 'admin' ? '/api/admin/notifications' : '/api/notifications', { method: 'PATCH' })
      if (!res.ok) {
        setSummary(previousUser)
        setAdminSummary(previousAdmin)
      }
    } catch {
      setSummary(previousUser)
      setAdminSummary(previousAdmin)
    }
  }

  async function markOneRead(id: string) {
    if (tab === 'admin') {
      setAdminSummary((current) => ({
        unreadCount: Math.max(0, current.unreadCount - (current.notifications.find((item) => item.id === id)?.readAt ? 0 : 1)),
        notifications: current.notifications.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
        ),
      }))
    } else {
      setSummary((current) => ({
        unreadCount: Math.max(0, current.unreadCount - (current.notifications.find((item) => item.id === id)?.readAt ? 0 : 1)),
        notifications: current.notifications.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
        ),
      }))
    }
    try {
      await fetch(tab === 'admin' ? `/api/admin/notifications/${id}` : `/api/notifications/${id}`, { method: 'PATCH' })
    } catch {
      // Counter will self-heal on the next polling cycle.
    }
  }

  async function clearNotifications() {
    if (activeSummary.notifications.length === 0) return
    const confirmed = window.confirm(tab === 'admin' ? 'Очистить админские уведомления?' : 'Очистить ваши уведомления?')
    if (!confirmed) return

    const previousUser = summary
    const previousAdmin = adminSummary
    if (tab === 'admin') {
      setAdminSummary({ unreadCount: 0, notifications: [] })
    } else {
      setSummary({ unreadCount: 0, notifications: [] })
    }

    try {
      const res = await fetch(tab === 'admin' ? '/api/admin/notifications' : '/api/notifications', { method: 'DELETE' })
      if (!res.ok) {
        setSummary(previousUser)
        setAdminSummary(previousAdmin)
      }
    } catch {
      setSummary(previousUser)
      setAdminSummary(previousAdmin)
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
  }, [refresh])

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
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-surface-950">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 dark:border-white/10 dark:bg-surface-950 dark:shadow-black/30 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(24rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <div className="text-sm font-semibold text-slate-950 dark:text-white">Уведомления</div>
              <div className="text-xs text-slate-500">
                {activeSummary.unreadCount > 0 ? `Новых: ${activeSummary.unreadCount}` : 'Новых нет'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={markAllRead}
                disabled={activeSummary.unreadCount === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Прочитано
              </button>
              <button
                type="button"
                onClick={clearNotifications}
                disabled={activeSummary.notifications.length === 0}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-200"
                title="Очистить"
                aria-label="Очистить уведомления"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {showAdmin && (
            <div className="grid grid-cols-2 gap-1 border-b border-slate-100 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
              <button
                type="button"
                className={cn('rounded-lg px-3 py-2 text-sm font-medium transition', tab === 'user' ? 'bg-white text-slate-950 shadow-sm dark:bg-surface-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}
                onClick={() => setTab('user')}
              >
                Мои {summary.unreadCount > 0 ? `· ${summary.unreadCount}` : ''}
              </button>
              <button
                type="button"
                className={cn('rounded-lg px-3 py-2 text-sm font-medium transition', tab === 'admin' ? 'bg-white text-slate-950 shadow-sm dark:bg-surface-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}
                onClick={() => setTab('admin')}
              >
                Админка {adminSummary.unreadCount > 0 ? `· ${adminSummary.unreadCount}` : ''}
              </button>
            </div>
          )}

          <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto p-2 sm:max-h-96">
            {activeSummary.notifications.length > 0 ? (
              activeSummary.notifications.map((item) => (
                tab === 'admin' ? (
                  <AdminNotificationRow
                    key={item.id}
                    notification={item as AdminNotificationView}
                    onNavigate={() => {
                      void markOneRead(item.id)
                      setOpen(false)
                    }}
                  />
                ) : (
                  <NotificationRow
                    key={item.id}
                    notification={item as UserNotificationView}
                    onNavigate={() => {
                      void markOneRead(item.id)
                      setOpen(false)
                    }}
                  />
                )
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Уведомлений пока нет</div>
            )}
          </div>

          <Link
            href={tab === 'admin' ? '/dashboard/admin/notifications' : '/dashboard/notifications'}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          >
            {tab === 'admin' ? 'Все события' : 'Все уведомления'}
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
