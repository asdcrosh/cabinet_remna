'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Bell, Check, CheckCheck, Gift, LifeBuoy, Megaphone, ShieldAlert, WalletCards } from 'lucide-react'
import type { UserNotificationView } from '@/lib/user-notifications'
import {
  groupNotifications,
  notificationGroup,
  notificationPriority,
  type GroupedUserNotification,
  type NotificationFilter,
  type NotificationPriority,
} from '@/lib/notification-presentation'
import { cn } from '@/lib/cn'

const prioritySections: Array<{ value: NotificationPriority; title: string; description: string }> = [
  { value: 'action', title: 'Требуют действия', description: 'Оплата или доступ нуждаются в вашем внимании.' },
  { value: 'attention', title: 'Обратите внимание', description: 'События, которые лучше не откладывать.' },
  { value: 'updates', title: 'Остальные события', description: 'Оплаты, бонусы и новости.' },
]

export function NotificationsList({ initialNotifications }: { initialNotifications: UserNotificationView[] }) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState<NotificationFilter>('all')

  async function markAllRead() {
    const now = new Date().toISOString()
    const previous = notifications
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? now })))
    try {
      const response = await fetch('/api/notifications', { method: 'PATCH' })
      if (!response.ok) setNotifications(previous)
    } catch {
      setNotifications(previous)
    }
  }

  async function markGroupRead(ids: string[]) {
    const unreadIds = ids.filter((id) => notifications.some((item) => item.id === id && !item.readAt))
    if (unreadIds.length === 0) return

    const now = new Date().toISOString()
    const previous = notifications
    const idSet = new Set(unreadIds)
    setNotifications((items) => items.map((item) => idSet.has(item.id) ? { ...item, readAt: now } : item))

    try {
      const results = await Promise.all(unreadIds.map((id) => fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        keepalive: true,
      })))
      if (results.some((response) => !response.ok)) setNotifications(previous)
    } catch {
      setNotifications(previous)
    }
  }

  const unreadCount = notifications.filter((item) => !item.readAt).length
  const filteredNotifications = notifications.filter((item) => filter === 'all' || notificationGroup(item.type) === filter)
  const groupedNotifications = groupNotifications(filteredNotifications)
  const filterItems: Array<{ value: NotificationFilter; label: string; count: number }> = [
    { value: 'all', label: 'Все', count: notifications.length },
    { value: 'payments', label: 'Платежи', count: notifications.filter((item) => notificationGroup(item.type) === 'payments').length },
    { value: 'subscription', label: 'Подписка', count: notifications.filter((item) => notificationGroup(item.type) === 'subscription').length },
    { value: 'support', label: 'Поддержка', count: notifications.filter((item) => notificationGroup(item.type) === 'support').length },
    { value: 'bonus', label: 'Бонусы', count: notifications.filter((item) => notificationGroup(item.type) === 'bonus').length },
    { value: 'broadcast', label: 'Новости', count: notifications.filter((item) => notificationGroup(item.type) === 'broadcast').length },
  ]
  const activeFilter = filterItems.find((item) => item.value === filter) ?? filterItems[0]!
  const emptyCopy = getEmptyCopy(filter, activeFilter.label, notifications.length)

  return (
    <section className="space-y-5" aria-label="История уведомлений">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-slate-950 dark:text-white">{unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Всё прочитано'}</div>
          <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{notifications.length} событий</div>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={markAllRead} className="btn-secondary w-full sm:w-auto">
            <CheckCheck className="h-4 w-4" />
            Отметить все
          </button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 [scrollbar-width:none] dark:border-white/10 [&::-webkit-scrollbar]:hidden">
        {filterItems.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={cn(
              'flex min-h-10 min-w-fit items-center gap-2 rounded-lg px-3 text-sm font-medium transition',
              filter === item.value
                ? 'bg-slate-100 text-slate-950 dark:bg-white/10 dark:text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950 dark:hover:bg-white/5 dark:hover:text-white'
            )}
          >
            {item.label}
            <span className={cn('rounded-full px-1.5 py-0.5 text-xs', filter === item.value ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-300/15 dark:text-cyan-100' : 'bg-slate-100 dark:bg-white/10')}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {groupedNotifications.length > 0 ? (
        <div className="space-y-6">
          {prioritySections.map((section) => {
            const items = groupedNotifications.filter((item) => notificationPriority(item.notification.type) === section.value)
            if (items.length === 0) return null

            return (
              <section key={section.value} aria-labelledby={`notification-priority-${section.value}`}>
                <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2 px-1">
                  <div>
                    <h2 id={`notification-priority-${section.value}`} className="text-sm font-semibold text-slate-950 dark:text-white">{section.title}</h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{section.description}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-400">{items.length}</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
                  {items.map((item) => <NotificationItem key={item.notification.id} group={item} onRead={markGroupRead} />)}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center dark:border-white/10 dark:bg-white/[0.035]">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
              <Bell className="h-5 w-5" />
            </div>
            <div className="mt-3 font-medium text-slate-950 dark:text-white">{emptyCopy.title}</div>
            <div className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{emptyCopy.description}</div>
            {notifications.length > 0 ? (
              <button type="button" className="btn-secondary mt-4" onClick={() => setFilter('all')}>Показать все</button>
            ) : (
              <Link href="/dashboard/settings?section=notifications" className="btn-secondary mt-4">Настроить уведомления</Link>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function getEmptyCopy(filter: NotificationFilter, label: string, total: number) {
  if (total === 0 || filter === 'all') {
    return { title: 'Здесь пока тихо', description: 'Новые события по подписке, оплатам и поддержке появятся здесь.' }
  }
  return { title: `В разделе «${label}» ничего нет`, description: 'Можно вернуться ко всем уведомлениям.' }
}

function NotificationItem({ group, onRead }: { group: GroupedUserNotification; onRead: (ids: string[]) => Promise<void> }) {
  const { notification, count, unreadCount, ids } = group
  const Icon = notificationIcon(notification.type)
  const actionLabel = notification.actionHref ? notification.actionLabel ?? defaultActionLabel(notification.type) : null

  return (
    <article className={cn(
      'flex gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-white/10 sm:px-5',
      unreadCount > 0 ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : 'bg-white/40 dark:bg-transparent'
    )}>
      <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', unreadCount > 0 ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-300/10 dark:text-cyan-200' : 'bg-slate-100 text-slate-400 dark:bg-white/[0.06]')}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h3 className="break-words font-semibold text-slate-950 dark:text-white">{notification.title}</h3>
          <time className="shrink-0 text-xs text-slate-400">{formatDate(notification.createdAt)}</time>
        </div>
        <p className="mt-1 break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {count > 1 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">{count} похожих</span>}
          {actionLabel && notification.actionHref ? (
            <Link
              href={notification.actionHref}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              onClick={() => void onRead(ids)}
            >
              {actionLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : unreadCount > 0 ? (
            <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.07]" onClick={() => void onRead(ids)}>
              <Check className="h-3.5 w-3.5" />
              Прочитано
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function defaultActionLabel(type: UserNotificationView['type']) {
  if (type === 'PAYMENT_FAILED' || type === 'PAYMENT_STUCK') return 'Проверить оплату'
  if (type === 'SUBSCRIPTION_EXPIRING' || type === 'SUBSCRIPTION_TERMINATED') return 'Продлить'
  if (type === 'SUPPORT_REPLY') return 'Открыть ответ'
  if (type === 'BONUS_GRANTED') return 'Открыть бонус'
  return 'Открыть'
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
    timeZone: 'Europe/Moscow',
  }).format(new Date(value))
}
