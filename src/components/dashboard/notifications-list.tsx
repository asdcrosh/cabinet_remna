'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck } from 'lucide-react'
import type { UserNotificationView } from '@/lib/user-notifications'
import { cn } from '@/lib/cn'

export function NotificationsList({ initialNotifications }: { initialNotifications: UserNotificationView[] }) {
  const [notifications, setNotifications] = useState(initialNotifications)

  async function markAllRead() {
    const now = new Date().toISOString()
    const previous = notifications
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? now })))
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH' })
      if (!res.ok) setNotifications(previous)
    } catch {
      setNotifications(previous)
    }
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-white/70 bg-white/60 p-4 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-surface-950/40 dark:shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-500">Непрочитанные</div>
          <div className="text-2xl font-semibold text-slate-950 dark:text-white">{unreadCount}</div>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-surface-900 dark:text-slate-200 dark:hover:bg-surface-800"
        >
          <CheckCheck className="h-4 w-4" />
          Отметить все
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-surface-950/50 dark:shadow-black/20">
        {notifications.length > 0 ? (
          notifications.map((item) => <NotificationItem key={item.id} notification={item} />)
        ) : (
          <div className="grid min-h-64 place-items-center px-4 py-12 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Bell className="h-5 w-5" />
              </div>
              <div className="mt-3 font-medium text-slate-950 dark:text-white">Уведомлений пока нет</div>
              <div className="mt-1 text-sm text-slate-500">Важные события появятся здесь.</div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function NotificationItem({ notification }: { notification: UserNotificationView }) {
  const content = (
    <div
      className={cn(
        'flex gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-white/10',
        notification.readAt ? 'bg-white/40 dark:bg-transparent' : 'bg-cyan-50/60 dark:bg-cyan-950/20'
      )}
    >
      <span className={cn('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', notification.readAt ? 'bg-slate-300' : 'bg-cyan-500')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-slate-950 dark:text-white">{notification.title}</h2>
          <time className="text-xs text-slate-400">{formatDate(notification.createdAt)}</time>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.body}</p>
        {notification.actionLabel && <div className="mt-2 text-sm font-medium text-cyan-700 dark:text-cyan-300">{notification.actionLabel}</div>}
      </div>
    </div>
  )

  if (notification.actionHref) {
    return (
      <Link href={notification.actionHref} className="block transition hover:bg-slate-50 dark:hover:bg-white/5">
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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
