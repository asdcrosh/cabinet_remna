import type { UserNotificationView } from './user-notifications'

export type NotificationFilter = 'all' | 'payments' | 'subscription' | 'support' | 'bonus' | 'broadcast'
export type NotificationPriority = 'action' | 'attention' | 'updates'

export type GroupedUserNotification = {
  notification: UserNotificationView
  ids: string[]
  count: number
  unreadCount: number
}

export function groupNotifications(notifications: UserNotificationView[]) {
  const grouped = new Map<string, GroupedUserNotification>()

  for (const notification of notifications) {
    const key = [notification.type, notification.title.trim(), notification.body.trim(), notification.actionHref ?? ''].join('\u0000')
    const current = grouped.get(key)

    if (current) {
      current.ids.push(notification.id)
      current.count += 1
      if (!notification.readAt) current.unreadCount += 1
      continue
    }

    grouped.set(key, {
      notification,
      ids: [notification.id],
      count: 1,
      unreadCount: notification.readAt ? 0 : 1,
    })
  }

  return [...grouped.values()]
}

export function notificationPriority(type: UserNotificationView['type']): NotificationPriority {
  if (type === 'PAYMENT_FAILED' || type === 'PAYMENT_STUCK' || type === 'SUBSCRIPTION_TERMINATED' || type === 'TRAFFIC_LIMIT') return 'action'
  if (type === 'SUBSCRIPTION_EXPIRING' || type === 'WHITELIST_ADDON_EXPIRING' || type === 'SUPPORT_REPLY') return 'attention'
  return 'updates'
}

export function notificationGroup(type: UserNotificationView['type']): NotificationFilter {
  if (type === 'PAYMENT_SUCCESS' || type === 'PAYMENT_FAILED' || type === 'PAYMENT_STUCK') return 'payments'
  if (
    type === 'SUBSCRIPTION_EXPIRING'
    || type === 'WHITELIST_ADDON_EXPIRING'
    || type === 'SUBSCRIPTION_TERMINATED'
    || type === 'SUBSCRIPTION_PAUSED'
    || type === 'SUBSCRIPTION_RESUMED'
    || type === 'TRAFFIC_LIMIT'
  ) return 'subscription'
  if (type === 'SUPPORT_REPLY') return 'support'
  if (type === 'BONUS_GRANTED') return 'bonus'
  return 'broadcast'
}
