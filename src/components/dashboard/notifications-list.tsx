'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, Gift, LifeBuoy, Megaphone, ShieldAlert, WalletCards } from 'lucide-react'
import type { UserNotificationView } from '@/lib/user-notifications'
import { cn } from '@/lib/cn'

type NotificationFilter = 'all' | 'payments' | 'subscription' | 'support' | 'bonus' | 'broadcast'

export function NotificationsList({ initialNotifications }: { initialNotifications: UserNotificationView[] }) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState<NotificationFilter>('all')

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
  const filteredNotifications = notifications.filter((item) => filter === 'all' || notificationGroup(item.type) === filter)
  const filterItems: Array<{ value: NotificationFilter; label: string; count: number }> = [
    { value: 'all', label: 'Все', count: notifications.length },
    { value: 'payments', label: 'Платежи', count: notifications.filter((item) => notificationGroup(item.type) === 'payments').length },
    { value: 'subscription', label: 'Подписка', count: notifications.filter((item) => notificationGroup(item.type) === 'subscription').length },
    { value: 'support', label: 'Поддержка', count: notifications.filter((item) => notificationGroup(item.type) === 'support').length },
    { value: 'bonus', label: 'Бонусы', count: notifications.filter((item) => notificationGroup(item.type) === 'bonus').length },
    { value: 'broadcast', label: 'Новости', count: notifications.filter((item) => notificationGroup(item.type) === 'broadcast').length },
  ]

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="metric-card">
          <div className="text-sm text-slate-500 dark:text-slate-400">Непрочитанные</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{unreadCount}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Всего событий: {notifications.length}</div>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="btn-secondary h-full min-h-14"
        >
          <CheckCheck className="h-4 w-4" />
          Отметить все
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-lg border border-white/70 bg-white/60 p-2 shadow-sm dark:border-white/10 dark:bg-surface-950/40">
        {filterItems.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              'flex min-w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition',
              filter === item.value
                ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                : 'text-slate-500 hover:bg-white hover:text-slate-950 dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            {item.label}
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', filter === item.value ? 'bg-white/15 dark:bg-slate-950/10' : 'bg-slate-100 dark:bg-white/10')}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-surface-950/50 dark:shadow-black/20">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((item) => <NotificationItem key={item.id} notification={item} />)
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
  const Icon = notificationIcon(notification.type)
  const content = (
    <div
      className={cn(
        'flex gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-white/10',
        notification.readAt ? 'bg-white/40 dark:bg-transparent' : 'bg-cyan-50/60 dark:bg-cyan-950/20'
      )}
    >
      <span className={cn('mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg', notification.readAt ? 'bg-slate-100 text-slate-400 dark:bg-white/10' : 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200')}>
        <Icon className="h-4 w-4" />
      </span>
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

function notificationGroup(type: UserNotificationView['type']): NotificationFilter {
  if (type === 'PAYMENT_SUCCESS' || type === 'PAYMENT_FAILED' || type === 'PAYMENT_STUCK') return 'payments'
  if (type === 'SUBSCRIPTION_EXPIRING' || type === 'TRAFFIC_LIMIT') return 'subscription'
  if (type === 'SUPPORT_REPLY') return 'support'
  if (type === 'BONUS_GRANTED' || type === 'MISSION_COMPLETED' || type === 'SEASONAL_EVENT') return 'bonus'
  if (type === 'AUTOFUNNEL') return 'broadcast'
  return 'broadcast'
}

function notificationIcon(type: UserNotificationView['type']) {
  const group = notificationGroup(type)
  if (group === 'payments') return WalletCards
  if (group === 'subscription') return ShieldAlert
  if (group === 'support') return LifeBuoy
  if (group === 'bonus') return Gift
  if (group === 'broadcast') return Megaphone
  return Bell
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
