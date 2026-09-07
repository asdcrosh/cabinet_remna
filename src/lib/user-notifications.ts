import type { NotificationType, UserNotification } from '@prisma/client'

export type UserNotificationView = {
  id: string
  type: NotificationType
  title: string
  body: string
  actionHref: string | null
  actionLabel: string | null
  readAt: string | null
  createdAt: string
}

export function serializeUserNotification(notification: UserNotification): UserNotificationView {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    actionHref: notification.actionHref,
    actionLabel: notification.actionLabel,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  }
}

export function prepareUserNotificationForDisplay(
  notification: UserNotificationView,
  now = Date.now()
): UserNotificationView {
  const staleExpiringBonus = notification.type === 'BONUS_GRANTED'
    && notification.title.toLocaleLowerCase('ru-RU').includes('скоро истеч')
    && now - new Date(notification.createdAt).getTime() > 3 * 24 * 60 * 60 * 1000

  return staleExpiringBonus
    ? { ...notification, actionHref: null, actionLabel: null }
    : notification
}
